/* eslint-disable @typescript-eslint/no-namespace */
import { Params } from '@divine/commons';
import { Authorization, WWWAuthenticate } from '@divine/headers';
import { Condition } from '@divine/synchronization';
import { AsyncLocalStorage } from 'async_hooks';
import { PasswordCredentials } from './auth-schemes';
import { BasicAuthScheme } from './auth-schemes/basic';
import { parse as parseDBRef } from './private/dbref';
import { DatabaseURI, DBParams, DBParamsSelector, DBQuery, DBResult, DBTransactionParams, q } from './protocols/database';
import { getBestSelector } from './selectors';
import { IOError } from './uri';

const als = new AsyncLocalStorage<{ ref: number, conn: DBConnection, failed: boolean }>();

export type DBCallback<T> = (retryCount: number | null) => Promise<T>;

export interface DBConnection {
    readonly state: 'open' | 'closed';

    open(): Promise<void>;
    close(): Promise<void>;
    ping(timeout: number): Promise<void>;

    query(...queries: DBQuery[]): Promise<DBResult[]>;
    watch?(query: DBQuery): AsyncIterable<DBResult>;
    transaction<T>(dtp: DBTransactionParams, cb: DBCallback<T>): Promise<T>;

    reference(dbURI: DatabaseURI): DBReference | Promise<DBReference>;
}

interface IdleConnection {
    conn:    DBConnection;
    expires: number;
}

export abstract class DBConnectionPool {
    static readonly defaultRetries        = 8;
    static readonly defaultBackoff        = ((count: number): number => (2 ** count - Math.random()) * 100);
    static readonly defaultTimeout        = 60_000;
    static readonly defaultTTL            = 30_000;
    static readonly defaultKeepalive      = 10_000;
    static readonly defaultMaxConnections = 10;

    protected _params: DBParams;

    private _connectionCount = 0;
    private _usedConnections: Set<DBConnection> = new Set();
    private _idleConnections: IdleConnection[] = [];
    private _idleCondition = new Condition();

    constructor(protected _dbURI: DatabaseURI, params: DBParamsSelector) {
        this._params = params.params;
        setInterval(() => this._checkIdleConnections(), this._params.keepalive ?? DBConnectionPool.defaultKeepalive).unref();
    }

    protected abstract _createDBConnection(): DBConnection | Promise<DBConnection>;

    async session<T>(cb: (connection: DBConnection) => Promise<T>): Promise<T> {
        let tls = als.getStore();

        if (!tls) {
            tls = { ref: 0, conn: await this._obtainConnection(), failed: false };

            const actual = cb;
            // @ts-expect-error (@types/node is wrong)
            cb = (connection) => als.run(tls, actual, connection);
        }

        try {
            ++tls.ref;

            if (tls.conn.state !== 'open') {
                throw new IOError(`This database connection has been closed`);
            }

            return await cb(tls.conn);
        }
        catch (err) {
            tls.failed = true;
            throw err;
        }
        finally {
            if (--tls.ref === 0) {
                const conn = tls.conn;
                tls.conn = null!
                /* async */ this._releaseConnection(conn, tls.failed);
            }
        }
    }

    async close(): Promise<void> {
        // Close all connections (including in-use connections, if any)

        const connections = [...this._idleConnections.map((ic) => ic.conn), ...this._usedConnections];
        await Promise.all(connections.map((c) => this._closeConnection(c, false)));
    }

    protected async _getAuthorization(challenges: WWWAuthenticate[] = WWWAuthenticate.create('basic')): Promise<Authorization | undefined> {
        const method  = this._dbURI.protocol.slice(0, -1);
        const headers = Object.entries(getBestSelector(this._dbURI.selectors.headers, this._dbURI)?.headers ?? {});

        return await this._dbURI['_getAuthorization']({ method, url: this._dbURI, headers }, undefined, challenges);
    }

    protected async _getCredentials(): Promise<PasswordCredentials | undefined> {
        const auth = await this._getAuthorization();

        return auth?.scheme === 'basic' ? BasicAuthScheme.decodeCredentials(auth.credentials) : undefined;
    }

    private async _obtainConnection(): Promise<DBConnection> {
        const timeout = this._params.timeout ?? DBConnectionPool.defaultTimeout;
        const expires = Date.now() + timeout

        while (Date.now() <= expires) {
            let conn = this._idleConnections.pop()?.conn;

            if (!conn && this._connectionCount < (this._params.maxConnections ?? DBConnectionPool.defaultMaxConnections)) {
                ++this._connectionCount;

                try {
                    conn = await this._createDBConnection();
                    await conn.open();
                }
                catch (err: any) {
                    --this._connectionCount;
                    await conn?.close().catch(() => 0);
                    throw err instanceof IOError ? err : new IOError('Failed to open new database connection', err, this._dbURI);
                }
            }

            if (conn) {
                this._usedConnections.add(conn);
                return conn;
            }

            await this._idleCondition.wait(expires - Date.now())
        }

        throw new IOError(`Failed to obtain a database connection within ${timeout} ms`, undefined, this._dbURI);
    }

    private async _releaseConnection(conn: DBConnection, maybeDead: boolean): Promise<void> {
        if (conn.state !== 'open' && this._closeConnection(conn, false) ||
            maybeDead && await this._closeConnection(conn, true)) {
            return;
        }

        if (this._usedConnections.delete(conn)) { // Only re-add if connection is still in use
            this._idleConnections.push({ conn, expires: Date.now() + (this._params.ttl ?? DBConnectionPool.defaultTTL) });
            this._idleCondition.notify();
        }
    }

    private async _closeConnection(conn: DBConnection, onlyIfDead: boolean): Promise<boolean> {
        if (onlyIfDead) {
            try {
                await conn.ping(this._params.keepalive ?? DBConnectionPool.defaultKeepalive);
                return false; // All good, connection not closed
            }
            catch (err) {
                // Close it
            }
        }

        // Remove connection from lists and close it
        --this._connectionCount;
        this._usedConnections.delete(conn);
        this._idleConnections = this._idleConnections.filter((ic) => ic.conn !== conn);
        this._idleCondition.notify();

        await conn.close().catch(() => 0);
        return true; // Connection closed
    }

    private async _checkIdleConnections() {
        await Promise.all(this._idleConnections.map((ic) => this._closeConnection(ic.conn, ic.expires > Date.now())));
    }
}

namespace DBReference {
    export type Scope  = 'scalar' | 'one' | 'unique' | 'all';

    export type Filter =
        { op: 'lt' | 'le' | 'eq' | 'ne' | 'ge' | 'gt', column: string, value: string } |
        { op: 'and' | 'or', value: Filter[] } |
        { op: 'not',        value: Filter };

    export type Params = {
        offset?: string;
        count?:  string;
        sort?:   string;
        lock?:   string;
    }
}

export class DBReference {
    table:    string[];
    keys?:    string[];
    columns?: string[];
    scope?:   DBReference.Scope;
    filter?:  DBReference.Filter;
    params:   DBReference.Params;

    constructor(protected _dbURI: DatabaseURI) {
        try {
            const parts = parseDBRef(_dbURI.hash.substr(1));

            this.table   = parts.table;
            this.keys    = parts.keys;
            this.columns = parts.columns ?? undefined;
            this.scope   = parts.scope   ?? undefined;
            this.filter  = parts.filter  ?? undefined;
            this.params  = parts.params  ?? {};
        }
        catch (err: any) {
            throw this._makeIOError(`Failed to parse fragment as DB reference: ${err.message}`, err);
        }
    }

    protected _makeIOError(message: string, err?: Error): IOError {
        return new IOError(message, err, this._dbURI);
    }

    protected _quote(ddl: string): DBQuery {
        return q.quote(ddl);
    }

    protected _getTable(): DBQuery {
        return q.join('.', this.table.map((t) => this._quote(t)));
    }

    protected _getKeys(): DBQuery {
        return q.join(',', this.keys?.map((c) => this._quote(c)) ?? [])
    }

    protected _getColumns(): DBQuery {
        return this.columns
            ? q.join(',', this.columns.map((c) => this._quote(c)))
            : q`*`;
    }

    protected _getFilter(filter: DBReference.Filter): DBQuery {
        switch (filter.op) {
            case 'and':  return q.join('and', filter.value.map((f) => q`(${this._getFilter(f)})`));
            case 'or':   return q.join('or',  filter.value.map((f) => q`(${this._getFilter(f)})`));
            case 'not':  return q`not (${this._getFilter(filter.value)})`;
            case 'lt':   return q`${this._quote(filter.column)} < ${filter.value}`;
            case 'le':   return q`${this._quote(filter.column)} <= ${filter.value}`;
            case 'eq':   return q`${this._quote(filter.column)} = ${filter.value}`;
            case 'ne':   return q`${this._quote(filter.column)} <> ${filter.value}`;
            case 'ge':   return q`${this._quote(filter.column)} >= ${filter.value}`;
            case 'gt':   return q`${this._quote(filter.column)} > ${filter.value}`;
        }

        throw this._makeIOError(`Unexpected filter operator ${filter['op']}`);
    }

    protected _getSortOrder(): [ column?: string, desc?: boolean ] {
        const sort = this.params.sort;

        return sort ?
            sort[0] === '-'
                ? [ sort.substr(1), true ] : [ sort, false ]
                : [ undefined, undefined ];
    }

    protected _getCountAndOffset(): [ count?: number, offset?: number ] {
        const count  = typeof this.params.count  === 'string' ? Number(this.params.count)  : undefined;
        const offset = typeof this.params.offset === 'string' ? Number(this.params.offset) : undefined;

        if (count !== undefined && isNaN(count)) {
            throw this._makeIOError(`Invalid 'count' param: ${count}`);
        }
        else if (offset !== undefined && isNaN(offset)) {
            throw this._makeIOError(`Invalid 'offset' param: ${offset}`);
        }

        return [ count, offset ];
    }

    protected _getWhereClause(): DBQuery {
        return this.filter ? q`where ${this._getFilter(this.filter)}` : q``;
    }

    protected _getOrderClause(): DBQuery {
        const [ column, desc ] = this._getSortOrder();

        return column ? q`order by ${this._quote(column)} ${desc ? q`desc` : q``}` : q``;
    }

    protected _getPagingClause(): DBQuery {
        const [ count, offset ] = this._getCountAndOffset();

        return count !== undefined || offset !== undefined
            ? q`offset ${q.raw(offset ?? 0)} rows fetch next ${q.raw(count ?? 'null')} rows only`
            : q``;
        }

    protected _getLockClause(): DBQuery {
        const lock = this.params.lock;

        if (lock === 'write') {
            return q`for update`;
        }
        else if (lock === 'read') {
            return q`for share`;
        }
        else if (lock === undefined) {
            return q``;
        }
        else {
            throw this._makeIOError(`Invalid 'lock' param: ${lock}: must be 'read' or 'write'`);
        }
    }

    protected _checkLoadArguments(): void {
        if (this.keys) {
            throw this._makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (this.scope === 'scalar' && this.columns?.length !== 1) {
            throw this._makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
        }
    }

    getLoadQuery(): DBQuery {
        this._checkLoadArguments();

        return q`\
select ${this.scope === 'unique' ? q`distinct` : q``} ${this._getColumns()} \
from ${this._getTable()} \
${this._getWhereClause()} \
${this._getOrderClause()} \
${this._getPagingClause()} \
${this._getLockClause()} \
`;
    }

    protected _checkSaveArguments(value: unknown, keysRequired: boolean): [ scope: DBReference.Scope, columns: string[], objects: Params[], keys?: string[] ] {
        const [ scope, columns, objects ] = this._checkSaveAndAppendArguments(value);

        if (keysRequired && !this.keys) {
            throw this._makeIOError(`Primary keys is required for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this._makeIOError(`No parameters may be specified for this query`);
        }

        return [ scope, columns, objects, this.keys ];
    }

    getSaveQuery(value: unknown): DBQuery {
        const [ _scope, _objects ] = this._checkSaveArguments(value, false);

        throw this._makeIOError(`Operation is not supported for this database`);
    }

    protected _checkAppendArguments(value: unknown): [ scope: DBReference.Scope, columns: string[], objects: Params[] ] {
        const [ scope, columns, objects ] = this._checkSaveAndAppendArguments(value);

        if (this.keys) {
            throw this._makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this._makeIOError(`No parameters may be specified for this query`);
        }

        return [ scope, columns, objects ];
    }

    private _checkSaveAndAppendArguments(value: unknown): [ scope: DBReference.Scope, columns: string[], objects: Params[] ] {
        let objects: object[];

        this.scope ??= (Array.isArray(value) ? 'all' : 'one');

        if (this.scope === 'scalar') {
            if (this.columns?.length !== 1) {
                throw this._makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
            }
            else {
                objects = [{ [this.columns[0]]: value }];
            }
        }
        else if (this.scope === 'one') {
            if (Array.isArray(value) || typeof value !== 'object' || value === null) {
                throw this._makeIOError(`Argument must be a object when scope is 'one'`);
            }
            else {
                objects = [ value ];
            }
        }
        else if (this.scope === 'all') {
            if (!Array.isArray(value)) {
                throw this._makeIOError(`Argument must be an array when scope is 'all'`);
            }
            else {
                objects = value;
            }
        }
        else {
            throw this._makeIOError(`Unsupported scope '${this.scope}`);
        }

        if (objects.length === 0) {
            throw this._makeIOError(`Need at least one value for this query`);
        }
        else if (this.filter) {
            throw this._makeIOError(`No filter may be specified for this query`);
        }

        this.columns ??= [...new Set(objects.map(Object.keys).flat())];

        return [ this.scope, this.columns, objects as Params[] ];
    }

    getAppendQuery(value: unknown): DBQuery {
        const [ _scope, columns, objects ] = this._checkAppendArguments(value);

        return q`insert into ${this._getTable()} ${q.values(objects, columns)}`
    }

    protected _checkModifyArguments(value: unknown): [ scope: DBReference.Scope, columns: string[], object: Params ] {
        let object: object;

        this.scope ??= 'one';

        if (this.scope === 'scalar') {
            if (this.columns?.length !== 1) {
                throw this._makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
            }
            else {
                object = { [this.columns[0]]: value };
            }
        }
        else if (this.scope === 'one') {
            if (Array.isArray(value) || typeof value !== 'object' || value === null) {
                throw this._makeIOError(`Argument must be a object when scope is 'one'`);
            }
            else {
                object = value;
            }
        }
        else {
            throw this._makeIOError(`Unsupported scope '${this.scope}`);
        }

        if (this.keys) {
            throw this._makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this._makeIOError(`No parameters may be specified for this query`);
        }
        else if (!this.filter) {
            throw this._makeIOError('A filter is required to this query');
        }

        this.columns ??= Object.keys(object);

        return [ this.scope, this.columns, object as Params ];
    }

    getModifyQuery(value: unknown): DBQuery {
        const [ _scope, columns, object ] = this._checkModifyArguments(value);

        return q`update ${this._getTable()} set ${q.assign(object, columns)} ${this._getWhereClause()}`;
    }

    checkRemoveArguments(): void {
        if (this.keys) {
            throw this._makeIOError(`No primary keys may be specified for this query`);
        }
        else if (this.columns) {
            throw this._makeIOError(`No columns may be specified for this query`);
        }
        else if (this.scope) {
            throw this._makeIOError(`No scope may be specified for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this._makeIOError(`No parameters may be specified for this query`);
        }
        else if (!this.filter) {
            throw this._makeIOError('A filter is required to this query');
        }
    }

    getRemoveQuery(): DBQuery {
        this.checkRemoveArguments();

        return q`delete from ${this._getTable()} ${this._getWhereClause()}`;
    }
}
