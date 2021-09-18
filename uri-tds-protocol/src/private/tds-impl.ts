import { BasicCredentials, DatabaseURI, DBColumnInfo, DBDriver, DBError, DBMetadata, DBQuery, DBResult, DBTransactionParams, q } from '@divine/uri';
import { ColumnMetaData, Connection, Request, TYPES } from 'tedious';
import { types } from 'util';

export class TDSConnectionPool extends DBDriver.DBConnectionPool {
    constructor(dbURI: DatabaseURI, private _getCredentials: () => Promise<BasicCredentials | undefined>) {
        super(dbURI);
    }

    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new TDSDatabaseConnection(this.dbURI, await this._getCredentials());
    }
}

class TDSDatabaseConnection implements DBDriver.DBConnection {
    private _client?: Connection;
    private _tlevel = 0;
    private _savepoint = 0;

    constructor(private _dbURI: DatabaseURI, private _creds?: BasicCredentials) {
    }

    async open() {
        this._client = await new Promise((resolve, reject) => {
            const [ server, ...instance ] = decodeURIComponent(this._dbURI.hostname).split('\\');
            const [ username, ...domain ] = this._creds?.identity.split('@') ?? [];

            const client = new Connection({
                server,
                authentication: {
                    type:         domain?.length > 0 ? 'ntlm' : 'default',
                    options: {
                        domain:   domain?.join('@') || undefined,
                        userName: username,
                        password: this._creds?.secret,
                    },
                },
                options: {
                    database:     decodeURIComponent(this._dbURI.pathname).substr(1),
                    instanceName: instance.join('\\') || undefined,
                    port:         Number(this._dbURI.port) || undefined,
                    useUTC:       false,
                    // debug: { packet: true, data: true, payload: true }
                }
            })
            // .on('debug',   (msg) => { console.debug(msg) })
            .on('connect', (err) => { err ? reject(err) : resolve(client) });

            client.connect();
        });
    }

    async close() {
        if (this._client) {
            await new Promise((resolve, reject) => {
                this._client!.once('end', resolve).once('error', reject).close();
            });

            delete this._client;
        }
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        if (!this._client) {
            throw new ReferenceError('Driver not open');
        }

        const result: DBResult[] = [];

        for (const query of queries) {
            try {
                let columns: ColumnMetaData[] = []
                const  rows: unknown[][] = [];

                const rowCount = await new Promise<number>((resolve, reject) => {
                    const request = new Request(query.toString((_v, i) => `@${i}`), (err, rowCount) => err ? reject(err) : resolve(rowCount))
                        .on('columnMetadata', (ci) => columns = ci)
                        .on('row', (row) => rows.push(row.map((c) => c.value)))

                    for (const [i, _v] of query.params.entries()) {
                        const v =
                            _v instanceof Date ? _v :
                            _v instanceof Uint8Array ? Buffer.from(_v) :
                            _v !== null && typeof _v === 'object' && !Array.isArray(_v) ? JSON.stringify(_v) :
                            _v;

                        const t =
                            _v instanceof Buffer ? TYPES.VarBinary :
                            _v instanceof Date ? TYPES.DateTimeOffset :
                            TYPES.NVarChar;

                        request.addParameter(String(i), t, v);
                    }

                    this._client!.execSql(request);
                });

                result.push(new TDSResult(this._dbURI, columns, rows, rowCount));
            }
            catch (err: any) {
                throw typeof err.errno === 'number' && typeof err.sqlState === 'string'
                    ? new DBError(String(err.errno), err.sqlState, 'Query failed', err, query)
                    : err;
            }
        }

        return result;
    }

    async transaction<T>(dtp: DBTransactionParams, cb: () => Promise<T> | T): Promise<T> {
        if (!this._client) {
            throw new ReferenceError('Driver not open');
        }

        const level = this._tlevel++;

        try {
            if (level === 0) {
                const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
                const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;

                for (let retry = 0; /* Keep going */; ++retry) {
                    await new Promise<void>((resolve, reject) => this._client!.beginTransaction((err) => err ? reject(err) : resolve()));

                    try {
                        const result = await cb();
                        await new Promise<void>((resolve, reject) => this._client!.commitTransaction((err) => err ? reject(err) : resolve()))
                        return result;
                    }
                    catch (err) {
                        await new Promise<void>((resolve, reject) => this._client?.rollbackTransaction((err) => err ? reject(err) : resolve()));

                        if (err instanceof DBError && err.state === '40001' /* 1213: ER_LOCK_DEADLOCK */ && retry < retries) {
                            // Sleep a bit, then retry
                            await new Promise((resolve) => setTimeout(resolve, backoff(retry)));
                        }
                        else {
                            throw err;
                        }
                    }
                }
            }
            else {
                const savepoint = `_${level}_${this._savepoint++}`;

                await this.query(q.raw(`save tran ${savepoint}`));

                try {
                    return await cb();
                }
                catch (err) {
                    await this.query(q.raw(`rollback tran ${savepoint}`)).catch(() => 0);
                    throw err;
                }
            }
        }
        finally {
            this._tlevel--;
        }
    }

    reference(dbURI: DatabaseURI): DBDriver.DBReference {
        return new TDSReference(dbURI);
    }
}

// nullable: !!(column.flags & 0x01),
// caseSensitive: !!(column.flags & 0x02),
// identity: !!(column.flags & 0x10),
// readOnly: !(column.flags & 0x0C)
// if (column.udtInfo) {
//     outColumn.udt = {
//       name: column.udtInfo.typeName,
//       database: column.udtInfo.dbname,
//       schema: column.udtInfo.owningSchema,
//       assembly: column.udtInfo.assemblyName
//     }

export class TDSResult extends DBResult {
    constructor(private _db: DatabaseURI, private _ci: ColumnMetaData[], rows: unknown[][], rowCount: number) {
        super(_ci.map((ci) => ({
                label:   ci.colName,
                type_id: (ci.type as any).id,
            })), rows, rowCount);

        // Fixup BigInt, Numeric/Decimal
        for (let c = 0; c < _ci.length; ++c) {
            const { colName, type: { name } , dataLength } = _ci[c];

            if (name === 'BigInt' || name === 'IntN' && dataLength === 8) {
                this.forEach((row) => row[c] = row[c] === null ? null : BigInt(row[c] as any))
            }
            else if (name === 'NumericN' || name === 'DecimalN') {
                if (rows.some((row) => row[c] !== null)) {
                    console.warn(`${name} data in column "${colName}" may be truncated (see tediousjs/tedious#163)`);
                }

                this.forEach((row) => row[c] = row[c] === null ? null : String(row[c]));
            }
        }

        Object.defineProperty(this, '_db', { enumerable: false });
        Object.defineProperty(this, '_ci', { enumerable: false });
    }

    async updateColumnInfo(): Promise<DBColumnInfo[]> {
        return this.columns;
    }
}

export class TDSReference extends DBDriver.DBReference {
    constructor(dbURI: DatabaseURI) {
        super(dbURI);
    }

}
