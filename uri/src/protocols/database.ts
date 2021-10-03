import { ContentType } from '@divine/headers';
import { SecureContextOptions } from 'tls';
import { DBCallback, DBConnection, DBConnectionPool } from '../database-driver';
import { toObject } from '../parsers';
import { DBSessionSelector, invalidCharacter, isDatabaseTransactionParams, isDBCallback } from '../private/database-utils';
import { BasicTypes, esxxEncoder, isTemplateStringsLike, Params } from '../private/utils';
import { FIELDS, HEADERS, IOError, Metadata, ParamsSelector, STATUS, STATUS_TEXT, URI, VOID, WithFields } from '../uri';

export function q(query: TemplateStringsArray, ...params: unknown[]): DBQuery;
export function q(query: string, params: Params): DBQuery;
export function q(query: TemplateStringsArray | string, ...params: unknown[]): DBQuery {
    if (isTemplateStringsLike(query)) {
        return new DBQuery(query, params);
    }
    else if (typeof query === 'string' && params.length === 1 && params[0] !== null && typeof params[0] === 'object') {
        const values: unknown[] = [];

        query = esxxEncoder(query, params[0] as Params, (value) => {
            values.push(value);
            return invalidCharacter;
        });

        return new DBQuery(query.split(invalidCharacter), values);
    }
    else {
        throw new TypeError()
    }
}

q.quote = function(ident: string): DBQuery {
    return q.raw(`"${ident.replace(/"/g, '""')}"`);
}

q.raw = function(raw: string | number | bigint): DBQuery {
    return new DBQuery([String(raw)], []);
}

q.join = function(delimiter: string, queries: (DBQuery | undefined)[]): DBQuery {
    queries = queries.filter((q) => q !== undefined);

    return new DBQuery([...queries.map((_, i) => i === 0 ? '' : delimiter), ''], queries);
}

q.list = function(list: (BasicTypes | undefined)[]): DBQuery {
    list = list.filter((d) => d !== undefined);

    if (list.length === 0) {
        return new DBQuery(['()'], []);
    }
    else {
        return new DBQuery(['(', ...Array(list.length - 1).fill(','), ')'], list);
    }
}

q.values = function(data: Params | Params[], columns?: string[], parts: 'columns' | 'values' | 'expr' = 'expr', quote = q.quote): DBQuery {
    const params = [ data ].flat();
    const values = (param: any): DBQuery => {
        return q.join(',', columns!.map((column) => q`${param[column]}`))
    }

    columns ??= Object.keys(params[0]);
    columns = columns.filter((c) => (params[0])[c] !== undefined);

    return q`${ parts === 'expr' || parts === 'columns' ? q`(${ q.join(',', columns.map((column) => quote(column))) })` : q``
            }${ parts === 'expr'                        ? q` values ` : q``
            }${ parts === 'expr' || parts === 'values'  ? q.join(',', params.map((param) => q`(${ values(param) })`)) : q`` }`;

    // return q`(${q.join(',', columns.map((column) => quote(column)))}) values ${q.join(',', params.map((param) => q`(${values(param)})`))}`
}

q.assign = function(data: Params, columns?: string[], quote = q.quote): DBQuery {
    columns ??= Object.keys(data);
    columns = columns.filter((c) => (data)[c] !== undefined);

    return q.join(',', columns.map((column) => q`${quote(column)} = ${data[column]}`));
}

export interface DBParamsSelector extends ParamsSelector {
    params: {
        timeout?:        number;
        ttl?:            number;
        keepalive?:      number;
        maxConnections?: number;

        tls?: SecureContextOptions & {
            rejectUnauthorized?: boolean;
        }
    };
}

// NOTE: Don't forget to update isDatabaseTransactionParams()!
export interface DBTransactionParams {
    retries?: number;
    backoff?: (count: number) => number;
    options?: DBQuery;
}

export interface DBMetadata extends Metadata, Required<WithFields<DBResult>> {
}

export interface DBColumnInfo {
    label:                      string;
    type_id?:                   number;

    table_catalog?:             string;
    table_schema?:              string;
    table_name?:                string;
    column_name?:               string;

    ordinal_position?:          number;
    column_default?:            unknown;
    is_nullable?:               boolean;
    data_type?:                 string;
    character_maximum_length?:  number;
    character_octet_length?:    number;
    numeric_precision?:         number;
    numeric_precision_radix?:   number;
    numeric_scale?:             number;
    datetime_precision?:        number;
    interval_type?:             string;
    interval_precision?:        number;
    character_set_catalog?:     string;
    character_set_schema?:      string;
    character_set_name?:        string;
    collation_catalog?:         string;
    collation_schema?:          string;
    collation_name?:            string;
    domain_catalog?:            string;
    domain_schema?:             string;
    domain_name?:               string;
    udt_catalog?:               string;
    udt_schema?:                string;
    udt_name?:                  string;
    scope_catalog?:             string;
    scope_schema?:              string;
    scope_name?:                string;
    maximum_cardinality?:       number;
    dtd_identifier?:            string;
    is_self_referencing?:       boolean;
    is_identity?:               boolean;
    identity_generation?:       string;
    identity_start?:            string;
    identity_increment?:        string;
    identity_maximum?:          string;
    identity_minimum?:          string;
    identity_cycle?:            boolean;
    is_generated?:              boolean;
    generation_expression?:     string;
    is_updatable?:              boolean;
    is_hidden?:                 boolean;
    crdb_sql_type?:             string;
    column_type?:               string;
    column_key?:                string;
    extra?:                     string;
    privileges?:                string;
    column_comment?:            string;
}

export class DBError extends IOError {
    constructor(public status: string, public state: string, message: string, cause?: Error, data?: object & Metadata) {
        super(message, cause, data);
    }

    toString(): string {
        return `[${this.constructor.name}: ${this.status}/${this.state} ${this.message}]`;
    }
}

export class DBQuery {
    private _query: ReadonlyArray<string>;
    private _params: unknown[];

    constructor(query: ReadonlyArray<string>, params: unknown[]) {
        if (query.length !== params.length + 1) {
            throw new TypeError(`Expected exactly ${query.length - 1} parameters`);
        }
        else {
            const myQuery: string[] = [ query[0] ];
            const myParams: unknown[] = [];

            for (let p = 0; p < query.length - 1; ++p) {
                const param = params[p];

                if (param instanceof DBQuery) {
                    if (param._query.length !== param._params.length + 1) {
                        throw new TypeError(`Nested DBQuery in param #${p} is not nestable`);
                    }

                    myQuery[myQuery.length - 1] += param._query[0];
                    myQuery.push(...param._query.slice(1));
                    myQuery[myQuery.length - 1] += query[p + 1];
                    myParams.push(...param._params);
                }
                else if (param !== undefined) {
                    myQuery.push(query[p + 1]);
                    myParams.push(param);
                }
                else {
                    throw new TypeError(`Parameter #${p} is undefined`);
                }
            }

            this._query = myQuery;
            this._params = myParams;
        }
    }

    get params(): unknown[] {
        return this._params;
    }

    toString(placeholder = (value: unknown, index: number, query: DBQuery) =>`«${value}»`) {
        return this._query.reduce((query, part, index) => index === 0 ? part : `${query}${placeholder(this._params[index - 1], index - 1, this)}${part}`);
    }
}

interface InformationSchema extends Partial<DBColumnInfo> {
    is_visible?: boolean;
    type_name?:  string;
    remarks?:    string;
}

type PropTypeMap<Obj, PropType> = {
    [K in { [P in keyof Obj]: Required<Obj>[P] extends PropType ? P : never }[keyof Obj] ]: true
} & {
    [K in { [P in keyof Obj]: Required<Obj>[P] extends PropType ? never : P }[keyof Obj] ]?: never
}

const stringColInfoProps: PropTypeMap<InformationSchema, string> = {
    label:                    true,
    table_catalog:            true,
    table_schema:             true,
    table_name:               true,
    column_name:              true,
    data_type:                true,
    interval_type:            true,
    character_set_catalog:    true,
    character_set_schema:     true,
    character_set_name:       true,
    collation_catalog:        true,
    collation_schema:         true,
    collation_name:           true,
    domain_catalog:           true,
    domain_schema:            true,
    domain_name:              true,
    udt_catalog:              true,
    udt_schema:               true,
    udt_name:                 true,
    scope_catalog:            true,
    scope_schema:             true,
    scope_name:               true,
    dtd_identifier:           true,
    identity_generation:      true,
    identity_start:           true,
    identity_increment:       true,
    identity_maximum:         true,
    identity_minimum:         true,
    generation_expression:    true,
    crdb_sql_type:            true,
    column_type:              true,
    column_key:               true,
    extra:                    true,
    privileges:               true,
    column_comment:           true,

    // Extras
    type_name:                true,
    remarks:                  true,
}

const numericColInfoProps: PropTypeMap<InformationSchema, number> = {
    type_id:                  true,
    ordinal_position:         true,
    character_maximum_length: true,
    character_octet_length:   true,
    numeric_precision:        true,
    numeric_precision_radix:  true,
    numeric_scale:            true,
    datetime_precision:       true,
    interval_precision:       true,
    maximum_cardinality:      true,
}

const booleanColInfoProps: PropTypeMap<InformationSchema, boolean> = {
    identity_cycle:      true,
    is_generated:        true,
    is_hidden:           true,
    is_identity:         true,
    is_nullable:         true,
    is_self_referencing: true,
    is_updatable:        true,

    // Extras
    is_visible:          true,
}

export abstract class DBResult extends Array<unknown[]> {
    static get [Symbol.species]() {
        return Array;
    }

    constructor(protected _db: DatabaseURI, public readonly columns: DBColumnInfo[], records: unknown[][], public rowCount?: number, public rowKey?: string) {
        super(records.length);
        Object.defineProperty(this, '_db', { enumerable: false });

        for (const c of columns) {
            for (const k of Object.keys(c) as (keyof typeof c)[]) {
                if (c[k] === undefined) {
                    delete c[k];
                }
            }
        }

        for (let r = 0, rl = records.length; r < rl; ++r) {
            this[r] = records[r];
        }
    }

    async updateColumnInfo(): Promise<DBColumnInfo[]> {
        const columns = this.columns.filter((ci) => ci.table_catalog && ci.table_schema && ci.table_name && ci.column_name)
            .map((ci) => q`(${ q.join(' and ', [
                q`table_catalog = ${ci.table_catalog}`,
                q`table_schema  = ${ci.table_schema}`,
                q`table_name    = ${ci.table_name}`,
                q`column_name   = ${ci.column_name}`,
            ]) })`);

        if (columns) {
            const colInfo = await this._db.query`select * from information_schema.columns where ${ q.join('or', columns) }`;
            const infomap: { [key: string]: InformationSchema | undefined } = {};

            for (const _ci of colInfo) {
                const ci = this._fixColumnInfo(_ci);

                infomap[`${ci.table_catalog}:${ci.table_schema}:${ci.table_name}:${ci.column_name}`] = ci;
            }

            // Update metadata for all columns
            this.columns.forEach((ci, i) => {
                Object.assign(this.columns[i], infomap[`${ci.table_catalog}:${ci.table_schema}:${ci.table_name}:${ci.column_name}`]);
            })
        }

        return this.columns;
    }

    protected _fixColumnInfo(columnRow: object): Partial<DBColumnInfo> {
        const ci: InformationSchema = {};

        for (const [_k, _v] of Object.entries(columnRow) ) {
            const k = _k.toLowerCase() as keyof InformationSchema;
            const v = _v == null || _v === undefined ? _v :
                      stringColInfoProps[k]  ? String(_v) :
                      numericColInfoProps[k] ? Number(_v) :
                      booleanColInfoProps[k] ? typeof _v === 'boolean' ? _v : (_v === 'YES' || _v === 'ALWAYS') :
                      _v;

            if (v !== null && v !== undefined) {
                ci[k] = v as any;
            }
        }

        // Variations
        if (Number(ci.data_type) && ci.type_name !== undefined) {
            ci.data_type = ci.type_name;
        }

        if (typeof ci.is_visible === 'boolean') {
            ci.is_hidden ??= !ci.is_visible;
        }

        if (ci.remarks !== undefined) {
            ci.column_comment ??= ci.remarks;
        }

        return ci;
    }

    toObjects<T extends object>(fields?: DBResult[]): T[] & DBMetadata {
        const result: T[] & WithFields<DBResult> = Array<T>(this.length);
        result[FIELDS] = fields ?? [ this ];

        for (let r = 0, rl = result.length, hl = this.columns.length; r < rl; ++r) {
            const s = this[r];
            const d = result[r] = {} as any;

            for (let h = 0; h < hl; ++h) {
                d[this.columns[h].label || h] = s[h];
            }
        }

        return result as T[] & DBMetadata;
    }
}

function toObjects<T extends object = object[]>(results: DBResult[]): T & DBMetadata {
    return results[results.length - 1].toObjects(results) as T & DBMetadata;
}

function withDBMetadata<T extends object>(meta: DBMetadata, value: object): T & DBMetadata {
    const result = value as T & DBMetadata;

    if (meta[FIELDS]       !== undefined) result[FIELDS]      = meta[FIELDS];
    if (meta[STATUS]       !== undefined) result[STATUS]      = meta[STATUS];
    if (meta[STATUS_TEXT]  !== undefined) result[STATUS_TEXT] = meta[STATUS_TEXT];
    if (meta[HEADERS]      !== undefined) result[HEADERS]     = meta[HEADERS];

    return result;
}

export abstract class DatabaseURI extends URI {
    protected abstract _createDBConnectionPool(params: DBParamsSelector['params']): DBConnectionPool | Promise<DBConnectionPool>;

    $(strings: TemplateStringsArray, ...values: unknown[]): DatabaseURI {
        const result = super.$(strings, ...values);

        if (result instanceof DatabaseURI) {
            return result;
        }
        else {
            throw new TypeError(`When using $ on a DatabaseURI, the URI type must not change`)
        }
    }

    load<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            const dbRef  = await conn.reference(this);
            const result = toObjects(await conn.query(dbRef.getLoadQuery()));

            if (dbRef.scope === 'scalar' || dbRef.scope === 'one') {
                if (result.length === 0) {
                    return withDBMetadata(result, Object(VOID));
                }
                else if (result.length === 1) {
                    return dbRef.scope === 'scalar'
                        ? withDBMetadata<T>(result, toObject(result[FIELDS][0][0][0]))
                        : withDBMetadata<T>(result, result[0]);
                }
                else {
                    throw new IOError(`Scope ${dbRef.scope} used with a multi-row result set`, undefined, result[FIELDS][0]);
                }
            }
            else {
                return result as T & DBMetadata;
            }
        });
    }

    save<T extends object>(data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getSaveQuery(data)));
        });
    }

    append<T extends object>(data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getAppendQuery(data)));
        });
    }

    modify<T extends object>(data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getModifyQuery(data)));
        });
    }

    remove<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getRemoveQuery()));
        });
    }

    query<T extends object = object[]>(...queries: DBQuery[]): Promise<T & DBMetadata>;
    query<T extends object = object[]>(query: TemplateStringsArray, ...params: (BasicTypes)[]): Promise<T & DBMetadata>;
    query<T extends object = object[]>(query: string, params: Params ): Promise<T & DBMetadata>;
    query<T>(params: DBTransactionParams, cb: DBCallback<T>): Promise<T>;
    query<T>(cb: DBCallback<T>): Promise<T>;
    async query<T>(first: DBQuery | TemplateStringsArray | string | DBTransactionParams | DBCallback<T>, ...rest: unknown[]): Promise<unknown & Metadata & WithFields<DBResult>> {
        return this._session(async (conn) => {
            if (first instanceof DBQuery && rest.every((r) => r instanceof DBQuery)) {
                return toObjects(await conn.query(first, ...rest as DBQuery[]));
            }
            else if (isTemplateStringsLike(first)) {
                return toObjects(await conn.query(q(first, ...rest)));
            }
            else if (typeof first === 'string' && rest.length === 1 && rest[0] !== null && typeof rest[0] === 'object') {
                return toObjects(await conn.query(q(first, rest[0] as Params)));
            }
            else if (isDatabaseTransactionParams(first) && rest.length === 1 && isDBCallback<T>(rest[0])) {
                return conn.transaction(first, rest[0])
            }
            else if (isDBCallback<T>(first) && rest.length === 0) {
                return conn.transaction({}, first);
            }
            else {
                throw new TypeError(`Invalid query() arguments`);
            }
        });
    }

    async close(): Promise<void> {
        const states = this._getBestSelector<DBSessionSelector>(this.selectors.session)?.states;

        if (states) {
            const database = states.database;
            delete states.database;
            await database?.close();
        }
    }

    private async _session<T>(cb: (connection: DBConnection) => Promise<T>): Promise<T> {
        let states = this._getBestSelector<DBSessionSelector>(this.selectors.session)?.states;

        if (!states) {
            states = {};
            this.addSelector({ selector: { uri: this.href.replace(/#.*/, '') }, states });
        }

        if (!states.database) {
            const params = this._getBestSelector<DBParamsSelector>(this.selectors.params)?.params;
            states.database = await this._createDBConnectionPool(params ?? {});
        }

        return states.database!.session(cb);
    }
}
