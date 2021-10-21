import { DatabaseURI, DBColumnInfo, DBDriver, DBError, DBQuery, DBResult, DBTransactionParams, q } from '@divine/uri';
import { SqliteError } from 'better-sqlite3';
import { basename, extname } from 'path';
import { Worker } from 'worker_threads';
import { SQLiteStatus } from './sqlite-errors';
import type { ExecuteQueryResult, SQLiteWorkerMessage, SQLiteWorkerResult } from './sqlite-worker';

export class SQLiteConnectionPool extends DBDriver.DBConnectionPool {
    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new SQLiteDatabaseConnection(this._dbURI);
    }
}

interface SQLiteMessage {
    message: SQLiteWorkerMessage;
    resolve(result: SQLiteWorkerResult): void;
    reject(error: Error): void;
}

class SQLiteDatabaseConnection implements DBDriver.DBConnection {
    state: 'open' | 'closed' = 'closed';

    private _dbPath: string;
    private _dbName: string;
    private _worker: Worker;
    private _error?: Error;
    private _messages: SQLiteMessage[] = [];
    private _current?: SQLiteMessage;
    private _online = false;
    private _tlevel = 0;
    private _savepoint = 0;

    constructor(private _dbURI: DatabaseURI) {
        this._dbPath = decodeURIComponent(_dbURI.pathname);
        this._dbName = basename(this._dbPath, extname(this._dbPath));
        this._worker = new Worker(require.resolve('./sqlite-worker'))
            .on('online',       ()       => this._transmitNext(true))
            .on('message',      (value)  => this._handleResult(value))
            .on('error',        (error)  => this._handleResult(null, error))
            .on('messageerror', (error)  => this._handleResult(null, error))
            .on('exit',         (code)   => this._handleResult(null, new Error(`Worker exited with code ${code}`)))
        ;
    }

    private async _execute<T extends ExecuteQueryResult>(message: SQLiteWorkerMessage): Promise<T> {
        const result = await new Promise<SQLiteWorkerResult>((resolve, reject) => {
            this._messages.push({ message, resolve, reject });

            if (this._messages.length === 1) {
                this._transmitNext();
            }
        });

        if (result.type === 'error') {
            throw typeof result.code === 'string' ? new SqliteError(result.message, result.code) : new Error(result.message);
        }
        else if (result.type !== message.type) {
            throw new Error(`Unexpected result type ${result.type}`);
        }

        return result as T;
    }

    private _transmitNext(isOnline?: boolean) {
        this._online = isOnline ?? this._online;

        if (this._online) {
            this._current = this._messages.shift();

            if (this._current) {
                if (this._error) {
                    this._handleResult(null, this._error); // Reject immediately
                }
                else {
                    this._worker.postMessage(this._current.message); // Send to worker
                }
            }
        }
    }

    private _handleResult(response: SQLiteWorkerResult | null, error?: Error): void {
        error ??= this._error;

        if (error) {
            this._error = error;
            this._current?.reject(error);
        }
        else {
            this._current?.resolve(response!);
        }

        this._transmitNext();
    }

    async open() {
        await this._execute({
            type:     'open',
            dbPath:   this._dbPath,
            params:   { },
        });

        this.state = 'open';
    }

    async close() {
        try {
            await this._execute({ 'type': 'close' });
        }
        finally {
            this.state = 'closed';
            await this._execute({ 'type': 'shutdown' }).catch(() => 0);
            await this._worker.terminate().catch(() => 0);
        }
    }

    async ping(_timeout: number) {
        await this.query(q`select null`);
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        const result: DBResult[] = [];

        for (const query of queries) {
            try {
                result.push(new SQLiteResult(this._dbURI, this._dbName, await this._execute<ExecuteQueryResult>({
                    type:   'execute',
                    query:  query.toString(() => '?'),
                    params: query.params.map(toSQLiteType),
                })));
            }
            catch (err) {
                throw err instanceof SqliteError ? new DBError(err.code, 'HY000', 'Query failed', err, query) : err;
            }
        }

        return result;
    }

    async transaction<T>(dtp: DBTransactionParams, cb: DBDriver.DBCallback<T>): Promise<T> {
        const level = this._tlevel++;

        try {
            if (level === 0) {
                const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
                const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;

                for (let retry = 0; /* Keep going */; ++retry) {
                    await this.query(q`begin ${dtp.options ?? q``}`);

                    try {
                        const result = await cb(retry);
                        await this.query(q`commit`);
                        return result;
                    }
                    catch (err) {
                        await this.query(q`rollback`).catch(() => { throw err });

                        if (err instanceof DBError && err.status === SQLiteStatus.SQLITE_BUSY && retry < retries) {
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

                await this.query(q.raw(`savepoint ${savepoint}`));

                try {
                    const result = await cb(null);
                    await this.query(q.raw(`release ${savepoint}`)).catch(() => 0);
                    return result;
                }
                catch (err) {
                    await this.query(q.raw(`rollback to ${savepoint}`)).catch(() => 0);
                    throw err;
                }
            }
        }
        finally {
            this._tlevel--;
        }
    }

    reference(dbURI: DatabaseURI): DBDriver.DBReference {
        return new SQLiteReference(dbURI);
    }
}

// This is silly but since all other driver provide type_id ...
const TypeIDs: Record<string, number> = { integer: 1, real: 2, text: 3, blob: 4, null: 5 };

export class SQLiteResult extends DBResult {
    constructor(db: DatabaseURI, dbPath: string, rs: ExecuteQueryResult) {
        super(db, rs.columns?.map((c) => ({
                label:         c.name,
                type_id:       TypeIDs[c.type ?? ''],
                table_catalog: (c.database && dbPath) ?? undefined,
                table_schema:  c.database ?? undefined,
                table_name:    c.table    ?? undefined,
                column_name:   c.column   ?? undefined,
                data_type:     c.type     ?? undefined,
            })) ?? [], rs.rows ?? [], rs.changes ?? rs.rows?.length, rs.lastInsertRowid);

        // Convert Uint8Array back to Buffer
        for (let c = 0; c < this.columns.length; ++c) {
            const { data_type } = this.columns[c];

            if (data_type === 'blob') {
                this.forEach((row) => row[c] = row[c] === null ? null : Buffer.from(row[c] as any));
            }
        }
    }

    async updateColumnInfo(): Promise<DBColumnInfo[]> {
        return this.columns;
    }
}

export class SQLiteReference extends DBDriver.DBReference {
    protected _getPagingClause(): DBQuery {
        const [ count, offset ] = this._getCountAndOffset();

        return count !== undefined || offset !== undefined
            ? q`limit ${q.raw(count ?? -1)} offset ${q.raw(offset ?? 0)}`
            : q``;
    }

    protected _getLockClause(): DBQuery {
        super._getLockClause(); // Check syntax
        return q``;
    }

    getSaveQuery(value: unknown): DBQuery {
        const [ _scope, columns, objects, keys] = this._checkSaveArguments(value, true);
        const updColumns = columns.filter((c) => !keys?.includes(c));

        return q`\
insert into ${this._getTable()} as _dst_ ${q.values(objects, columns)} \
on conflict (${this._getKeys()}) do update set ${
    q.join(',', updColumns.map((column) => q`${q.quote(column)} = "excluded".${q.quote(column)}`))
} returning *`;
    }

    getAppendQuery(value: unknown): DBQuery {
        return q`${super.getAppendQuery(value)} returning *`;
    }
}

function toSQLiteType(value: unknown): unknown {
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    else if (value instanceof Date) {
        return value.toISOString();
    }
    else if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return JSON.stringify(value);
    }
    else {
        return value;
    }
}