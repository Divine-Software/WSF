import { DatabaseURI, DBColumnInfo, DBDriver, DBError, DBQuery, DBResult, DBTransactionParams, q } from '@divine/uri';
import java from 'java';
import { promisify } from 'util';

export const classpath = java.classpath;

java.classpath.push(__dirname);
java.options.push('-Xrs');
java.asyncOptions = {
    promisify,
    asyncSuffix:   undefined,
    syncSuffix:    'Sync',
    promiseSuffix: ''
};

type Nullable<T> = { [P in keyof T]: null | T[P] }
type BridgeType = [ type: '=' | 'L' | 'D' | 'B' | 'J' | 'A', value: any ];
type BridgeColumnInfo = Nullable<Required<DBColumnInfo>>

interface DBBridgeResult {
    columns:  null | BridgeColumnInfo[];
    records:  null | BridgeType[][];
    rowCount: null | number;
    rowKey:   null | string;
}

interface DBConnectionBridge {
    close(): Promise<void>;
    ping(timeout: number): Promise<void>;
    query(query: string, values: BridgeType[][]): Promise<DBBridgeResult>;
    begin(isolationLevel: number): Promise<boolean>;
    rollback(): Promise<void>;
    commit(): Promise<void>;
}

const txOptions = /^ISOLATION LEVEL (READ UNCOMMITTED|READ COMMITTED|REPEATABLE READ|SERIALIZABLE)$/;

const ISOLATION_LEVELS: Record<string, number | undefined>  = {
    'READ UNCOMMITTED': 1,
    'READ COMMITTED':   2,
    'REPEATABLE READ':  4,
    'SERIALIZABLE':     8,
}

export class JDBCConnectionPool extends DBDriver.DBConnectionPool {
    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new JDBCDatabaseConnection(this._dbURI);
    }
}

class JDBCDatabaseConnection implements DBDriver.DBConnection {
    private _client?: DBConnectionBridge;

    constructor(private _dbURI: DatabaseURI) {
    }

    async open() {
        await java.ensureJvm();
        this._client = await java.newInstance('DBConnectionBridge', this._dbURI.href, null) as any;
    }

    async close() {
        this._client?.close();
        delete this._client;
    }

    async ping(timeout: number) {
        if (!this._client) {
            throw new ReferenceError('DBConnection closed');
        }

        await this._client.ping(timeout);
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        if (!this._client) {
            throw new ReferenceError('DBConnection closed');
        }

        const result: DBResult[] = [];

        for (const query of queries) {
            try {
                const params = query.params.map(toBridgeType);
                result.push(new JDBCResult(this._dbURI, await this._client.query(query.toString(() => '?'), params)));
            }
            catch (err: any) {
                const ecode = err.cause?.getErrorCodeSync?.();
                const state = err.cause?.getSQLStateSync?.();

                throw ecode && state ? new DBError(String(ecode), state, 'Query failed', err, query) : err;
            }
        }

        return result;
    }

    private _toIsolationLevel(options?: DBQuery): number {
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
            return 0;
        }
    }

    async transaction<T>(dtp: DBTransactionParams, cb: DBDriver.DBCallback<T>): Promise<T> {
        if (!this._client) {
            throw new ReferenceError('DBConnection closed');
        }

        const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
        const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;
        const options = this._toIsolationLevel(dtp.options);

        for (let retry = 0; /* Keep going */; ++retry) {
            const began = await this._client?.begin(options);

            try {
                const result = await cb(began ? retry : null);
                await this._client?.commit();
                return result;
            }
            catch (err) {
                await this._client?.rollback().catch(() => { throw err });

                if (err instanceof DBError && err.state === '40001' && began && retry < retries) {
                    // Sleep a bit, then retry
                    await new Promise((resolve) => setTimeout(resolve, backoff(retry)));
                }
                else {
                    throw err;
                }
            }
        }
    }

    reference(dbURI: DatabaseURI): DBDriver.DBReference {
        return new JDBCReference(dbURI);
    }
}

export class JDBCResult extends DBResult {
    constructor(db: DatabaseURI, rs: DBBridgeResult) {
        super(db,
              rs.columns?.map((ci) => toColumnInfo(ci)) ?? [],
              rs.records?.map((row) => row.map(fromBridgeType)) ?? [],
              rs.rowCount ?? rs.records?.length,
              rs.rowKey ?? undefined);
    }
}

export class JDBCReference extends DBDriver.DBReference {
    getSaveQuery(value: unknown): DBQuery {
        if (this.dbURI.pathname.startsWith('h2:')) {
            const [ _scope, columns, objects, keys ] = this.checkSaveArguments(value, false);
            const colQuery = q.values(objects, columns, 'columns');
            const valQuery = q.values(objects, columns, 'values');

            return q`merge into ${this.getTable()} ${colQuery} ${keys ? q`key (${this.getKeys()})` : q``} values ${valQuery}`;
        }
        else {
            return super.getSaveQuery(value);
        }
    }
}

function toColumnInfo(ci: BridgeColumnInfo): DBColumnInfo {
    return Object.fromEntries(Object.entries(ci)
        .map(([key, value]) => [key, value ?? undefined])
        .filter(([, value]) => typeof value !== 'function' && value !== undefined));
}

function toBridgeType(value: unknown): BridgeType {
    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return [ '=', value ];
    }
    else if (typeof value === 'bigint') {
        return [ 'L', String(value) ];
    }
    else if (value instanceof Date) {
        return [ 'D', value.toISOString() ];
    }
    else if (value instanceof Uint8Array) {
        return [ 'B', Buffer.from(value).toString('binary') ];
    }
    else if (typeof value === 'object' && !Array.isArray(value)) {
        return [ 'J', JSON.stringify(value) ];
    }
    else if (Array.isArray(value)) {
        return [ 'A', value.map(toBridgeType) ];
    }
    else {
        throw new TypeError(`Cannot handle datatype ${typeof value}`);
    }
}

function fromBridgeType(value: BridgeType): unknown {
    switch (value[0]) {
        case '=': return value[1];
        case 'L': return BigInt(value[1]);
        case 'D': return new Date(value[1]);
        case 'B': return Buffer.from(value[1], 'binary');
        case 'J': return JSON.parse(value[1]);
        case 'A': return value[1].map((v: any) => fromBridgeType(v));
    }

    throw new TypeError(`Invalid bridge type: ${value}`);
}
