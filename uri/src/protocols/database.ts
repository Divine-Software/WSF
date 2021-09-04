import { ContentType } from '@divine/headers';
import { SecureContextOptions } from 'tls';
import { DBConnection, DBConnectionPool } from '../database-driver';
import { toObject } from '../parsers';
import { DBCallback, DBSessionSelector, invalidCharacter, isDatabaseTransactionParams, isDBCallback } from '../private/database-utils';
import { BasicTypes, esxxEncoder, isTemplateStringsArray, Params } from '../private/utils';
import { FIELDS, HEADERS, IOError, Metadata, ParamsSelector, STATUS, STATUS_TEXT, URI, VOID, WithFields } from '../uri';

export function q(query: TemplateStringsArray, ...params: unknown[]): DBQuery {
    return new DBQuery(query, params);
}

q.quote = function(ident: string): DBQuery {
    return q.raw(`"${ident.replace(/"/g, '""')}"`);
}

q.raw = function(raw: string | number): DBQuery {
    return new DBQuery([String(raw)], []);
}

q.join = function(delimiter: string, queries: DBQuery[]): DBQuery {
    return new DBQuery([...queries.map((_, i) => i === 0 ? '' : delimiter), ''], queries);
}

q.values = function(data: object | object[], columns?: string[], quote = q.quote): DBQuery {
    const params = Array.isArray(data) ? data : [ data ];
    const values = (param: any): DBQuery => {
        return q.join(',', columns!.map((column) => q`${param[column]}`))
    }

    columns ??= Object.keys(params[0]);

    return q`(${q.join(',', columns.map((column) => quote(column)))}) values ${q.join(',', params.map((object) => q`(${values(object)})`))}`
}

q.assign = function(data: object, columns?: string[], quote = q.quote): DBQuery {
    columns ??= Object.keys(data);

    return q.join(',', columns.map((column) => q`${quote(column)} = ${(data as any)[column]}`));
}

export interface DBParamsSelector extends ParamsSelector {
    params: {
        timeout?: number;

        tls?: SecureContextOptions & {
            rejectUnauthorized?: boolean;
        }
    };
}

// NOTE: Don't forget to update isDatabaseTransactionParams()!
export interface DBTransactionParams {
    retries?: number;
    backoff?: (count: number) => number;
    begin?:   DBQuery;
}

export interface DBMetadata extends Metadata, Required<WithFields<DBResult>> {
}

export interface DBColumnInfo {
    label:                      string;

    table_catalog?:             string;
    table_schema?:              string;
    table_name?:                string;
    column_name?:               string;
    ordinal_position?:          number;
    column_default?:            string;
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
    private _batches: ReadonlyArray<ReadonlyArray<unknown>>;

    constructor(query: ReadonlyArray<string>, ...batches: ReadonlyArray<unknown>[]) {
        if (batches.length > 1) {
            for (let p = 0; p < query.length - 1; ++p) {
                for (const params of batches) {
                    const param = params[p];

                    if (param === undefined || typeof param !== typeof batches[0][p]) {
                        throw new TypeError(`Parameter #${p} must exist and be of same type in all batches`);
                    }
                    else if (param instanceof DBQuery) {
                        throw new TypeError(`Nested DBQuery in param #${p} not allowed in batch mode`);
                    }
                }
            }

            this._query = query;
            this._batches = batches;
        }
        else if (batches.length !== 1 || query.length !== batches[0].length + 1) {
            throw new TypeError(`Expected exactly ${query.length - 1} parameters in batch #0`);
        }
        else { // Single batch: nested Query params supported
            const myQuery: string[] = [ query[0] ];
            const myParams: unknown[] = [];
            const params = batches[0]

            for (let p = 0; p < query.length - 1; ++p) {
                const param = params[p];

                if (param instanceof DBQuery) {
                    if (param._batches.length !== 1 && param._query.length !== param._batches[0].length + 1) {
                        throw new TypeError(`Nested DBQuery in param #${p} is not nestable`);
                    }

                    myQuery[myQuery.length - 1] += param._query[0];
                    myQuery.push(...param._query.slice(1));
                    myQuery[myQuery.length - 1] += query[p + 1];
                    myParams.push(...param._batches[0]);
                }
                else {
                    myQuery.push(query[p + 1]);
                    myParams.push(param);
                }
            }

            this._query = myQuery;
            this._batches = [ myParams ];
        }
    }

    get batches(): ReadonlyArray<ReadonlyArray<unknown>> {
        return this._batches;
    }

    toString(placeholder = function(index: number, query: DBQuery, ) { return `{${index}}` }) {
        return this._query.reduce((query, part, index) => index === 0 ? part : `${query}${placeholder(index - 1, this)}${part}`);
    }
}

export abstract class DBResult extends Array<unknown[]> {
    static get [Symbol.species]() {
        return Array;
    }

    constructor(public readonly columns: DBColumnInfo[], records: unknown[][]) {
        super(records.length);

        for (let r = 0, rl = records.length; r < rl; ++r) {
            this[r] = records[r];
        }
    }

    abstract updateColumnInfo(): Promise<DBColumnInfo[]>;

    toObjects<T>(): T[];
    toObjects<T>(fields: DBResult[]): T[] & DBMetadata;
    toObjects<T>(fields?: DBResult[]): T[] & WithFields<DBResult> {
        const result: T[] & WithFields<DBResult> = Array<T>(this.length);

        result[FIELDS] = fields;

        for (let r = 0, rl = result.length, hl = this.columns.length; r < rl; ++r) {
            const s = this[r];
            const d = result[r] = {} as any;

            for (let h = 0; h < hl; ++h) {
                d[this.columns[h].label] = s[h];
            }
        }

        return result;
    }
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
    protected abstract _createDBConnectionPool(): DBConnectionPool | Promise<DBConnectionPool>;

    load<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            const dbRef  = await conn.reference(this);
            const result = await conn.query(dbRef.getLoadQuery());

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
            return conn.query((await conn.reference(this)).getSaveQuery(data)) as unknown as T & DBMetadata;
        });
    }

    append<T extends object>(data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return conn.query((await conn.reference(this)).getAppendQuery(data)) as unknown as T & DBMetadata;
        });
    }

    modify<T extends object>(data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return conn.query((await conn.reference(this)).getModifyQuery(data)) as unknown as T & DBMetadata;
        });
    }

    remove<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return conn.query((await conn.reference(this)).getRemoveQuery()) as unknown as T & DBMetadata;
        });
    }

    query<T extends object = object[]>(query: DBQuery): Promise<T & DBMetadata>;
    query<T extends object = object[]>(query: TemplateStringsArray, ...params: BasicTypes[]): Promise<T & DBMetadata>;
    query<T extends object = object[]>(query: string, ...batches: Params[] ): Promise<T & DBMetadata>;
    query<T>(params: DBTransactionParams, cb: DBCallback<T>): Promise<T>;
    query<T>(cb: DBCallback<T>): Promise<T>;
    async query<T>(first: DBQuery | TemplateStringsArray | string | DBTransactionParams | DBCallback<T>, ...rest: unknown[]): Promise<unknown & Metadata & WithFields<DBResult>> {
        return this._session(async (conn) => {
            if (first instanceof DBQuery && rest.length === 0) {
                return conn.query(first);
            }
            else if (isTemplateStringsArray(first)) {
                return conn.query(new DBQuery(first, rest));
            }
            else if (typeof first === 'string' && rest.length >= 1 && typeof rest[0] === 'object' /* Params required! */) {
                const batches = rest as Params[];
                const values = batches.map<unknown[]>(() => []);
                const query = esxxEncoder(first, batches[0], (_, key) => {
                    for (const b in values) {
                        values[b].push(batches[b][key]);
                    }

                    return invalidCharacter;
                });

                return conn.query(new DBQuery(query.split(invalidCharacter), ...values));
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

    private async _session<T>(cb: (connection: DBConnection) => Promise<T>): Promise<T> {
        let states = this._getBestSelector<DBSessionSelector>(this.selectors.session)?.states;

        if (!states) {
            states = { database: await this._createDBConnectionPool() };
            this.addSelector({ states });
        }

        return states.database!.session(cb);
    }
}