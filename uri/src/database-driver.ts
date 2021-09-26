/* eslint-disable @typescript-eslint/no-namespace */
import { AsyncLocalStorage } from 'async_hooks';
import { parse as parseDBRef } from './private/dbref';
import { Params } from './private/utils';
import { DatabaseURI, DBColumnInfo, DBMetadata, DBQuery, DBResult, DBTransactionParams, q } from './protocols/database';
import { IOError } from './uri';

const als = new AsyncLocalStorage<{ ref: number, conn: DBConnection }>();

export interface DBConnection {
    open(): Promise<void>;
    close(): Promise<void>;
    query(...queries: DBQuery[]): Promise<DBResult[]>;
    transaction<T>(dtp: DBTransactionParams, cb: () => Promise<T>): Promise<T>;
    reference(dbURI: DatabaseURI): DBReference | Promise<DBReference>;
}

export abstract class DBConnectionPool {
    static readonly defaultRetries = 8;
    static readonly defaultBackoff = ((count: number) => (2 ** count - Math.random()) * 100);

    constructor(protected dbURI: DatabaseURI) {
    }

    protected abstract _createDBConnection(): DBConnection | Promise<DBConnection>;

    async session<T>(cb: (connection: DBConnection) => Promise<T>): Promise<T> {
        let tls = als.getStore();

        if (!tls) {
            tls = { ref: 0, conn: await this._createDBConnection() };

            try {
                await tls.conn.open();
            }
            catch (err: any) {
                await tls.conn.close().catch(() => 0);
                throw err instanceof IOError ? err : new IOError('Failed to open new database connection', err, this.dbURI);
            }

            const actual = cb;
            // @ts-expect-error (@types/node is wrong)
            cb = (connection) => als.run(tls, actual, connection);
        }

        try {
            ++tls.ref;
            return await cb(tls.conn);
        }
        finally {
            if (--tls.ref === 0) {
                const conn = tls.conn;
                tls.conn = null!
                await conn.close().catch(() => 0);
            }
        }
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

    constructor(protected dbURI: DatabaseURI) {
        try {
            const parts = parseDBRef(dbURI.hash.substr(1));

            this.table   = parts.table;
            this.keys    = parts.keys;
            this.columns = parts.columns ?? undefined;
            this.scope   = parts.scope   ?? undefined;
            this.filter  = parts.filter  ?? undefined;
            this.params  = parts.params  ?? {};
        }
        catch (err: any) {
            throw this.makeIOError(`Failed to parse fragment as DB reference: ${err.message}`, err);
        }
    }

    protected makeIOError(message: string, err?: Error): IOError {
        return new IOError(message, err, this.dbURI);
    }

    protected quote(ddl: string): DBQuery {
        return q.quote(ddl);
    }

    protected getTable(): DBQuery {
        return q.join('.', this.table.map((t) => this.quote(t)));
    }

    protected getKeys(): DBQuery {
        return q.join(',', this.keys?.map((c) => this.quote(c)) ?? [])
    }

    protected getColumns(defaultColumns?: string[]): DBQuery {
        const columns = this.columns ?? defaultColumns;

        return columns
            ? q.join(',', columns.map((c) => this.quote(c)))
            : q`*`;
    }

    protected getFilter(filter: DBReference.Filter): DBQuery {
        switch (filter.op) {
            case 'and':  return q.join('and', filter.value.map((f) => q`(${this.getFilter(f)})`));
            case 'or':   return q.join('or',  filter.value.map((f) => q`(${this.getFilter(f)})`));
            case 'not':  return q`not (${this.getFilter(filter.value)})`;
            case 'lt':   return q`${this.quote(filter.column)} < ${filter.value}`;
            case 'le':   return q`${this.quote(filter.column)} <= ${filter.value}`;
            case 'eq':   return q`${this.quote(filter.column)} = ${filter.value}`;
            case 'ne':   return q`${this.quote(filter.column)} <> ${filter.value}`;
            case 'ge':   return q`${this.quote(filter.column)} >= ${filter.value}`;
            case 'gt':   return q`${this.quote(filter.column)} > ${filter.value}`;
        }

        throw this.makeIOError(`Unexpected filter operator ${filter['op']}`);
    }

    protected getSortOrder(): [ column?: string, desc?: boolean ] {
        const sort = this.params.sort;

        return sort ?
            sort[0] === '-'
                ? [ sort.substr(1), true ] : [ sort, false ]
                : [ undefined, undefined ];
    }

    protected getCountAndOffice(): [ count?: number, offset?: number ] {
        const count  = typeof this.params.count  === 'string' ? Number(this.params.count)  : undefined;
        const offset = typeof this.params.offset === 'string' ? Number(this.params.offset) : undefined;

        if (count !== undefined && isNaN(count)) {
            throw this.makeIOError(`Invalid 'count' param: ${count}`);
        }
        else if (offset !== undefined && isNaN(offset)) {
            throw this.makeIOError(`Invalid 'offset' param: ${offset}`);
        }

        return [ count, offset ];
    }

    protected getWhereClause(): DBQuery {
        return this.filter ? q`where ${this.getFilter(this.filter)}` : q``;
    }

    protected getOrderClause(): DBQuery {
        const [ column, desc ] = this.getSortOrder();

        return column ? q`order by ${this.quote(column)} ${desc ? q`desc` : q``}` : q``;
    }

    protected getPagingClause(): DBQuery {
        const [ count, offset ] = this.getCountAndOffice();

        return count !== undefined || offset !== undefined
            ? q`offset ${q.raw(offset ?? 0)} rows fetch next ${q.raw(count ?? 'null')} rows only`
            : q``;
        }

    protected getLockClause(): DBQuery {
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
            throw this.makeIOError(`Invalid 'lock' param: ${lock}: must be 'read' or 'write'`);
        }
    }

    protected checkLoadArguments(): void {
        if (this.keys) {
            throw this.makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (this.scope === 'scalar' && this.columns?.length !== 1) {
            throw this.makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
        }
    }

    getLoadQuery(): DBQuery {
        this.checkLoadArguments();

        return q`\
select ${this.scope === 'unique' ? q`distinct` : q``} ${this.getColumns()} \
from ${this.getTable()} \
${this.getWhereClause()} \
${this.getOrderClause()} \
${this.getPagingClause()} \
${this.getLockClause()} \
`;
    }

    protected checkSaveArguments(value: unknown, keysRequired: boolean): [ scope: DBReference.Scope, objects: Params[], keys?: string[] ] {
        const [ scope, objects ] = this.checkSaveAndAppendArguments(value);

        if (keysRequired && !this.keys) {
            throw this.makeIOError(`Primary keys is required for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this.makeIOError(`No parameters may be specified for this query`);
        }

        return [ scope, objects, this.keys ];
    }

    getSaveQuery(value: unknown): DBQuery {
        const [ _scope, _objects ] = this.checkSaveArguments(value, false);

        throw this.makeIOError(`Operation is not supported for this database`);
    }

    protected checkAppendArguments(value: unknown): [ scope: DBReference.Scope, objects: Params[] ] {
        const [ scope, objects ] = this.checkSaveAndAppendArguments(value);

        if (this.keys) {
            throw this.makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this.makeIOError(`No parameters may be specified for this query`);
        }

        return [ scope, objects ];
    }

    private checkSaveAndAppendArguments(value: unknown): [ scope: DBReference.Scope, objects: Params[] ] {
        const scope = this.scope ?? (Array.isArray(value) ? 'all' : 'one');
        let objects: object[];

        if (scope === 'scalar') {
            if (this.columns?.length !== 1) {
                throw this.makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
            }
            else {
                objects = [{ [this.columns[0]]: value }];
            }
        }
        else if (scope === 'one') {
            if (Array.isArray(value) || typeof value !== 'object' || value === null) {
                throw this.makeIOError(`Argument must be a object when scope is 'one'`);
            }
            else {
                objects = [ value ];
            }
        }
        else if (scope === 'all') {
            if (!Array.isArray(value)) {
                throw this.makeIOError(`Argument must be an array when scope is 'all'`);
            }
            else {
                objects = value;
            }
        }
        else {
            throw this.makeIOError(`Unsupported scope '${scope}`);
        }

        if (objects.length === 0) {
            throw this.makeIOError(`Need at least one value for this query`);
        }
        else if (this.filter) {
            throw this.makeIOError(`No filter may be specified for this query`);
        }

        return [ scope, objects as Params[] ];
    }

    getAppendQuery(value: unknown): DBQuery {
        const [ _scope, objects ] = this.checkAppendArguments(value);

        return q`insert into ${this.getTable()} ${q.values(objects, this.columns)}`
    }

    protected checkModifyArguments(value: unknown): [ scope: DBReference.Scope, object: Params ] {
        const scope = this.scope ?? 'one';
        let object: object;

        if (scope === 'scalar') {
            if (this.columns?.length !== 1) {
                throw this.makeIOError(`One and only one column must be specified when scope 'scalar' is used`);
            }
            else {
                object = { [this.columns[0]]: value };
            }
        }
        else if (scope === 'one') {
            if (Array.isArray(value) || typeof value !== 'object' || value === null) {
                throw this.makeIOError(`Argument must be a object when scope is 'one'`);
            }
            else {
                object = value;
            }
        }
        else {
            throw this.makeIOError(`Unsupported scope '${scope}`);
        }

        if (this.keys) {
            throw this.makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this.makeIOError(`No parameters may be specified for this query`);
        }

        return [ scope, object as Params ];
    }

    getModifyQuery(value: unknown): DBQuery {
        const [ _scope, object ] = this.checkModifyArguments(value);

        return q`update ${this.getTable()} set ${q.assign(object, this.columns)} ${this.getWhereClause()}`;
    }

    checkRemoveArguments(): void {
        if (this.keys) {
            throw this.makeIOError(`No primary keys may me be specified for this query`);
        }
        else if (this.columns) {
            throw this.makeIOError(`No columns may be specified for this query`);
        }
        else if (this.scope && this.scope !== 'all') {
            throw this.makeIOError(`Scope must be 'all' for this query`);
        }
        else if (Object.keys(this.params).length) {
            throw this.makeIOError(`No parameters may be specified for this query`);
        }
    }

    getRemoveQuery(): DBQuery {
        this.checkRemoveArguments();

        return q`delete from ${this.getTable()} ${this.getWhereClause()}`;
    }
}
