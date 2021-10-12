import { BasicCredentials, DatabaseURI, DBColumnInfo, DBDriver, DBError, DBParamsSelector, DBQuery, DBResult, DBTransactionParams, q } from '@divine/uri';
import { ColumnMetaData, Connection, ISOLATION_LEVEL, Request, TYPES } from 'tedious';
import { SQLServerSQLState as SQLState } from './tds-errors';

const txOptions = /^ISOLATION LEVEL (READ UNCOMMITTED|READ COMMITTED|REPEATABLE READ|SNAPSHOT|SERIALIZABLE)$/;

const ISOLATION_LEVELS: Record<string, ISOLATION_LEVEL | undefined> = {
    'READ UNCOMMITTED': ISOLATION_LEVEL.READ_UNCOMMITTED,
    'READ COMMITTED':   ISOLATION_LEVEL.READ_COMMITTED,
    'REPEATABLE READ':  ISOLATION_LEVEL.REPEATABLE_READ,
    'SNAPSHOT':         ISOLATION_LEVEL.SNAPSHOT,
    'SERIALIZABLE':     ISOLATION_LEVEL.SERIALIZABLE,
}

export class TDSConnectionPool extends DBDriver.DBConnectionPool {
    constructor(dbURI: DatabaseURI, params: DBParamsSelector['params'], private _getCredentials: () => Promise<BasicCredentials | undefined>) {
        super(dbURI, params);
    }

    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new TDSDatabaseConnection(this._dbURI, await this._getCredentials());
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

    async ping(_timeout: number) {
        await this.query(q`select null`);
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        if (!this._client) {
            throw new ReferenceError('DBConnection closed');
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
                throw typeof err.number === 'number' && typeof err.state === 'number'
                    ? new DBError(String(err.number), this._toSQLState(err.number, err.state), 'Query failed', err, query)
                    : err;
            }
        }

        return result;
    }

    private _toSQLState(error: number, state: number): string {
        switch (error) { // "Inspired" by the MSSQL JDBC driver
            case 208:   return SQLState.UNDEFINED_TABLE;
            case 515:   return SQLState.INTEGRITY_CONSTRAINT_VIOLATION;
            case 547:   return SQLState.INTEGRITY_CONSTRAINT_VIOLATION;
            case 1205:  return SQLState.SERIALIZATION_FAILURE;
            case 2601:  return SQLState.INTEGRITY_CONSTRAINT_VIOLATION;
            case 2627:  return SQLState.INTEGRITY_CONSTRAINT_VIOLATION;
            case 2714:  return SQLState.DUPLICATE_TABLE;
            case 8152:  return SQLState.STRING_DATA_RIGHT_TRUNCATION;
            default:    return 'S' + ('000' + state).slice(-4);
        }
    }

    private _toIsolationLevel(options?: DBQuery): ISOLATION_LEVEL {
        const expr = options?.toString().trim().toUpperCase();

        if (expr) {
            const [, level ] = txOptions.exec(expr) ?? [];
            const result = ISOLATION_LEVELS[level];

            if (result === undefined) {
                throw new TypeError(`Invalid transaction options ${expr}; must match ${txOptions}`);
            }

            return result;
        }
        else {
            return ISOLATION_LEVEL.NO_CHANGE;
        }
    }

    async transaction<T>(dtp: DBTransactionParams, cb: DBDriver.DBCallback<T>): Promise<T> {
        if (!this._client) {
            throw new ReferenceError('DBConnection closed');
        }

        const level = this._tlevel++;

        try {
            const trxName = `_${level}_${this._savepoint++}`;

            if (level === 0) {
                const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
                const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;
                const options = this._toIsolationLevel(dtp.options);

                for (let retry = 0; /* Keep going */; ++retry) {
                    await new Promise<void>((resolve, reject) => this._client!.beginTransaction((err) => err ? reject(err) : resolve(), trxName, options));

                    try {
                        const result = await cb(retry);
                        // @ts-expect-error: trxName is a param
                        await new Promise<void>((resolve, reject) => this._client!.commitTransaction((err) => err ? reject(err) : resolve(), trxName))
                        return result;
                    }
                    catch (err) {
                        try {
                            // @ts-expect-error: trxName is a param
                            await new Promise<void>((resolve, reject) => this._client?.rollbackTransaction((err) => err ? reject(err) : resolve()), trxName);
                        }
                        catch (err: any) {
                            if (err.number !== 3903) { // "The ROLLBACK TRANSACTION request has no corresponding BEGIN TRANSACTION"
                                throw err;
                            }
                        }

                        if (err instanceof DBError && err.status === '1205' && retry < retries) {
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
                // // @ts-expect-error: trxName is a param
                // await new Promise<void>((resolve, reject) => this._client!.saveTransaction((err) => err ? reject(err) : resolve(), trxName));
                await this.query(q.raw(`save tran ${trxName}`));

                try {
                    return await cb(null);
                }
                catch (err) {
                    // // @ts-expect-error: trxName is a param
                    // await new Promise<void>((resolve, reject) => this._client?.rollbackTransaction((err) => err ? reject(err) : resolve()), trxName).catch(() => 0);
                    await this.query(q.raw(`rollback tran ${trxName}`)).catch(() => 0);
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
    constructor(db: DatabaseURI, private _ci: ColumnMetaData[], rows: unknown[][], rowCount: number) {
        super(db, _ci.map((ci) => ({
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

        Object.defineProperty(this, '_ci', { enumerable: false });
    }

    async updateColumnInfo(): Promise<DBColumnInfo[]> {
        return this.columns;
    }
}

export class TDSReference extends DBDriver.DBReference {
    protected _getPagingClause(): DBQuery {
        const [ count, offset ] = this._getCountAndOffset();

        return count !== undefined || offset !== undefined
            ? q`offset ${q.raw(offset ?? 0)} rows ${count !== undefined ? q`fetch next ${q.raw(count)} rows only` : q``}`
            : q``;
    }

    protected _getLockClause(): DBQuery {
        const lock = this.params.lock;

        if (lock === 'write') {
            return q`with (updlock, holdlock)`;
        }
        else if (lock === 'read') {
            return q`with (holdlock)`;
        }
        else if (lock === undefined) {
            return q``;
        }
        else {
            throw this._makeIOError(`Invalid 'lock' param: ${lock}: must be 'read' or 'write'`);
        }
    }

    getLoadQuery(): DBQuery {
        this._checkLoadArguments();

        return q`\
select ${this.scope === 'unique' ? q`distinct` : q``} ${this._getColumns()} \
from ${this._getTable()} \
${this._getLockClause()} \
${this._getWhereClause()} \
${this._getOrderClause()} \
${this._getPagingClause()} \
`;
    }

    getAppendQuery(value: unknown): DBQuery {
        const [ _scope, columns, objects ] = this._checkAppendArguments(value);
        const colQuery = q.values(objects, columns, 'columns');
        const valQuery = q.values(objects, columns, 'values');

        return q`insert into ${this._getTable()} ${colQuery} output "inserted".* values ${valQuery}`;
    }
}
