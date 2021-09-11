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

    async query<T>(query: DBQuery): Promise<T[] & DBMetadata> {
        if (!this._client) {
            throw new ReferenceError('Driver not open');
        }
        else if (query.batches.length > 1) {
            throw new TypeError(`Batch queries not supported`);
        }

        const batch0 = query.batches[0] as unknown[];
        const pquery = query.toString((i) => `@${i}`);

        try {
            let columns: ColumnMetaData[] = []
            const  rows: unknown[][] = [];

            await new Promise<void>((resolve, reject) => {
                const request = new Request(pquery, (err) => err ? reject(err) : resolve())
                    .on('columnMetadata', (ci) => columns = ci)
                    .on('row', (row) => rows.push(row.map((c) => c.value)));

                for (const [i, _v] of batch0.entries()) {
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

            const dr = new TDSResult(this._dbURI, columns, rows);

            return dr.toObjects([ dr ]);
        }
        catch (err: any) {
            throw typeof err.errno === 'number' && typeof err.sqlState === 'string'
                ? new DBError(String(err.errno), err.sqlState, 'Query failed', err, query)
                : err;
        }
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

type InformationSchema = Omit<DBColumnInfo, 'label'>;

export class TDSResult extends DBResult {
    constructor(private _db: DatabaseURI, private _ci: ColumnMetaData[], rows: unknown[][]) {
        super(_ci.map((ci) => ({ label: ci.colName })), rows);

        // Fixup BigInt, Numeric/Decimal
        for (let c = 0; c < _ci.length; ++c) {
            const { colName, type: { name } , dataLength } = _ci[c];

            if (name === 'BigInt' || name === 'IntN' && dataLength === 8) {
                this.forEach((row) => row[c] = row[c] === null ? null : BigInt(row[c] as any))
            }
            else if (name === 'NumericN' || name === 'DecimalN') {
                console.warn(`${name} data in column "${colName}" may be truncated (see tediousjs/tedious#163)`);
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
