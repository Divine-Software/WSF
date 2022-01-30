import { AsyncIteratorAdapter, BasicTypes, esxxEncoder, isTemplateStringsLike, mapped, Params } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { Barrier, Signal } from '@divine/synchronization';
import { SecureContextOptions } from 'tls';
import { DBCallback, DBConnection, DBConnectionPool } from '../database-driver';
import { toObject } from '../parsers';
import { DBSessionSelector, invalidCharacter, isDatabaseTransactionParams, isDBCallback } from '../private/database-utils';
import { URIParams } from '../selectors';
import { FIELDS, HEADERS, IOError, Metadata, ParamsSelector, STATUS, STATUS_TEXT, URI, VOID, WithFields } from '../uri';

/**
 * Constructs a [[DBQuery]] from a template literal.
 *
 * All values/parameters will either be quoted and encoded or sent separately to the database server for processing,
 * depending on the actual database driver. Example:
 *
 * ```ts
 * const query = q`select * from table where first_name = ${firstName}`;
 * ```
 *
 * See also [[q.quote]], [[q.raw]], [[q.join]], [[q.list]], [[q.values]] and [[q.assign]] for handy utility functions.
 *
 * @param  strings    The query as a template string array.
 * @param  values     The query parameters. Values may be [[DBQuery]] instances themselves, or of any type supported by
 *                    the database.
 * @throws TypeError  If one of the parameters is `undefined`.
 * @returns           A new DBQeury object.
 */
export function q(query: TemplateStringsArray, ...params: unknown[]): DBQuery;
/**
 * Constructs a [[DBQuery]] from a query string. The string may contain `{prop}` placeholders, which will then be
 * resolved against properties in `params`.
 *
 * All values/parameters will either be quoted and encoded or sent separately to the database server for processing,
 * depending on the actual database driver. Example:
 *
 * ```ts
 * const query = q('select * from table where first_name = {name}', { name: firstName });
 * ```
 *
 * See also [[q.quote]], [[q.raw]], [[q.join]], [[q.list]], [[q.values]] and [[q.assign]] for handy utility functions.
 *
 * @param  query      The query, with `{prop}` placeholders for parameters.
 * @param  params     An record with parameters, used to look up placeholders from the query. Parameters may be DBQuery
 *                    instances themselves, or of any type supported by the database.
 * @throws TypeError  If one of the parameters is `undefined`.
 * @returns           A new DBQeury object.
 */
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
        throw new TypeError(`Arguments must be either a template string array, or a string with a params object`)
    }
}

/**
 * Constructs a [[DBQuery]] by enclosing the provied string in quotes.
 *
 * This function is used to escape SQL identifiers, like table or column names. Quotes inside the string will be encoded
 * as `""`. Example:
 *
 * ```ts
 * const table = debit ? 'debit-table' : 'credit-table';
 * const query = q`select * from ${q.quote(table)} where amount > 10`;
 * ```
 *
 * @param ident  The name of a table to column to escape.
 * @returns      A (partial) DBQuery with the identified escaped.
 */
q.quote = function(ident: string): DBQuery {
    return q.raw(`"${ident.replace(/"/g, '""')}"`);
}

/**
 * Constructs a [[DBQuery]] by taking the provided raw string as-is.
 *
 * This is useful if the database does not accept a parameter at this place in the query. However, you *must be very
 * careful* not to introduce query injection vulnerabilities when using this function! Example:
 *
 * ```ts
 * const offset = 100 * page; // Always a number
 * const query  = q`select * from posts limit 100 offset ${q.raw(offset)}`;
 * ```
 *
 * @param raw  The raw query to create. Must be trused and not be user-provided, or (very) bad things will happen
 *             eventually.
 * @returns    A (partial) DBQuery with the unparsed query.
 */
q.raw = function(raw: string | number | bigint): DBQuery {
    return new DBQuery([String(raw)], []);
}

/**
 * Constructs a [[DBQuery]] by concatenating a list of subqueries and separating then with the provided delimiter.
 *
 * If the list of subqueries contains `undefined`, those elements will be filtered out.
 *
 * @param delimiter  The raw sequence to separate the queries with. Must be trused and not be user-provided, or (very)
 *                   bad things will happen eventually.
 * @param queries    The subqueries to concatenate. May contain `undefined` elements, which will simply be skipped.
 * @returns          A new DBQuery with all subqueries concatenated.
 */
q.join = function(delimiter: string, queries: (DBQuery | undefined)[]): DBQuery {
    queries = queries.filter((q) => q !== undefined);

    return new DBQuery([...queries.map((_, i) => i === 0 ? '' : delimiter), ''], queries);
}

/**
 * Constructs a [[DBQuery]] by creating a list of the provided parameters: `(elem1, elem2, ...)`.
 *
 * This utility function is suitable for SQL `IN` clauses. If the parameter list contains `undefined`, those elements
 * will be filtered out.
 *
 * @param list  The parameters to include in the list. May contain `undefined` elements, which will simply be skipped.
 * @returns     A DBQuery suitable to be used in an SQL `IN` clause.
 */
q.list = function(list: (BasicTypes | undefined)[]): DBQuery {
    list = list.filter((d) => d !== undefined);

    if (list.length === 0) {
        return new DBQuery(['()'], []);
    }
    else {
        return new DBQuery(['(', ...Array(list.length - 1).fill(','), ')'], list);
    }
}

/**
 * Constructs a [[DBQuery]] to be used as part of SQL `INSERT` statements.
 *
 * Given an object (or list of objects) containing the column/value pairs, constructs either the *columns* list or the
 * *values* list (or lists), or both, depending on the `parts` argument. Examples:
 *
 * ```ts
 * // Insert columns nane, language, country
 * const entry = { name: 'Martin', language: 'sv', country: 'se' };
 * const query = q`insert into locale ${q.values(entry)}`;
 * ```
 *
 * ```ts
 * // Insert multiple rows, but only columns name and country
 * const multi = [ { name: 'Martin', language: 'sv', country: 'se' }, { name: 'John', language: 'en', country: 'us' } ];
 * const query = q`insert into users ${q.values(multi), ['name', 'country']}`;
 * ```
 *
 * @param data    The object or objects to insert. The key represents the column name and the value is the column value.
 * @param columns Specifies what keys (columns) to fetch from the data objects. Defaults to all keys from all objects.
 * @param parts   What part of the statement to generate. Use `columns` to only generate a list of column names,
 *                `values` for a list of value tuples or `expr`, the default` for the complete subexpression.
 * @param quote   The quote function to use when escaping the column names. Defaults to [[q.quote]].
 * @returns       A DBQuery suitable to be used in an SQL `INSERT` statement.
 */
q.values = function(data: Params | Params[], columns?: string[], parts: 'columns' | 'values' | 'expr' = 'expr', quote = q.quote): DBQuery {
    const params = [ data ].flat();
    const values = (param: any): DBQuery => {
        return q.join(',', columns!.map((column) => q`${vDefault(param[column])}`))
    }

    columns ??= [...new Set(params.map(Object.keys).flat())];

    return q`${ parts === 'expr' || parts === 'columns' ? q`(${ q.join(',', columns.map((column) => quote(column))) })` : q``
            }${ parts === 'expr'                        ? q` values ` : q``
            }${ parts === 'expr' || parts === 'values'  ? q.join(',', params.map((param) => q`(${ values(param) })`)) : q`` }`;
}

/**
 * Constructs a [[DBQuery]] to be used as part of SQL `UPDATE` statements.
 *
 * Given an object containing the column/value pairs, constructs an assignment expression that can be used as part of an
 * SQL `UPDATE` statement. Example:
 *
 * ```ts
 * const entry = { name: 'Martin', language: 'sv', country: 'se' };
 * const query = q`update locale set ${q.assign(entry)} where id = ${userID}`;
 * ```
 *
 * @param data    The object to assign. The key represents the column name and the value is the column value.
 * @param columns Specifies what keys (columns) to fetch from the data object. Defaults to all keys from the object.
 * @param quote   The quote function to use when escaping the column names. Defaults to [[q.quote]].
 * @returns       A DBQuery suitable to be used in an SQL `UPDATE` statement.
 */
q.assign = function(data: Params, columns?: string[], quote = q.quote): DBQuery {
    columns ??= Object.keys(data);

    return q.join(',', columns.map((column) => q`${quote(column)} = ${vDefault(data[column])}`));
}

/** Database configuration parameters. */
export interface DBParams extends URIParams {
    /**
     * Maximum time to wait for a free connection, in milliseconds. Default is [[DBConnectionPool.defaultTimeout]]
     * (60 seconds).
     */
    timeout?: number;

    /**
     * How long an unused connection should be kept before it's closed. Default is [[DBConnectionPool.defaultTTL]]
     * (30 seconds).
     */
    ttl?: number;

    /**
     * How often the status of an unused connection should be checked. Default is
     * [[DBConnectionPool.defaultKeepalive]] (10 seconds).
     */
    keepalive?: number;

    /**
     * The maximum number of connections to use. Default is [[DBConnectionPool.defaultMaxConnections]] (10
     * connections).
     */
    maxConnections?: number;

    /** Custom options to send to the database when openeing a connection. Depends on the database driver. */
    connectOptions?: Params,

    /** SSL/TLS parameters. */
    tls?: SecureContextOptions & {
        /** If `false`, allow servers not in CA list. Default is `true`. */
        rejectUnauthorized?: boolean;
    }
}

/** Provides configuration parameters for [[DatabaseURI]]. */
export interface DBParamsSelector extends ParamsSelector {
    params: DBParams;
}

/** Transaction parameters. */
export interface DBTransactionParams { // NOTE: Don't forget to update isDatabaseTransactionParams()!
    /** The number of times to retry the transaction in case of a deadlock. Default is
     * [[DBConnectionPool.defaultRetries]] (8 times). */
    retries?: number;

    /**
     * The backoff function to use when calculating the time to wait between retries. Default is
     * [[DBConnectionPool.defaultBackoff]] (exponential backoff—100 ms, 200 ms, 400 ms etc—with random jitter).
     */
    backoff?: (count: number) => number;

    /**
     * A database-specific subquery to send as options when starting the transaction. An example would be `ISOLATION
     * LEVEL SNAPSHOT`.
     */
    options?: DBQuery;
}

/** Like [[Metadata]], except that `[FIELD]` is always present as well and is an array of [[DBResult]]. */
export interface DBMetadata extends Metadata, Required<WithFields<DBResult>> {
}

/** Column information. Very much like the SQL `INFORMATION_SCHEMA.COLUMNS` view. */
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

/** An IOError subclass thrown by the [[DatabaseURI]] class and its subclasses. */
export class DBError extends IOError {
    /**
     * Constructs a new DBError exception.
     *
     * @param status   A database-specific status code. Will be empty if the DB does not use custom status codes (like
     *                 the *PostgreSQL* driver does).
     * @param state    The 5 character long *SQLSTATE* variable associated with this exception (for SQL databases at
     *                 least; some databases, especially non-SQL ones, will only provide a generic state here and use
     *                 `status` instead).
     * @param message  The error message.
     * @param cause    If this error was caused by another exception, pass it here to link it.
     * @param data     Custom, per-exception information associated with the exception.
     */
    constructor(public status: string, public state: string, message: string, cause?: Error, data?: object & Metadata) {
        super(message, cause, data);
    }

    /** Converts this DBError to a string. */
    override toString(): string {
        return `[${this.constructor.name}: ${this.status}/${this.state} ${this.message}]`;
    }
}

/* A flattened query string with parameters. */
export class DBQuery {
    private _query: ReadonlyArray<string>;
    private _params: unknown[];

    /**
     * Constructs a new DBQuery object.
     *
     * If one of the parameters is itself a DBQuery, the query will be merged at constructor time with this one and its
     * parameters adopted.
     *
     * @param  query      The query segments, much like a template literal string array.
     * @param  params     The parameters. There should be exactly one less parameter than query segments.
     * @throws TypeError  If one of the parameters is `undefined` or if a nested DBQuery is invalid.
     */
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

    /** The parameters as an array */
    get params(): unknown[] {
        return this._params;
    }

    /**
     * Converts this query into a string.
     *
     * @param placeholder  A function that returns a placeholder for each parameter. Might return just `?` or
     *                     `$1`/`$2`/etc, or actually encode the parameter to make the resulting query safe for
     *                     execution.
     * @returns            The query as a string, with the parameters expanded by the `placeholder` function.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toString(placeholder = (value: unknown, index: number, query: DBQuery) =>`«${value}»`): string {
        return this._query.reduce((query, part, index) => index === 0 ? part : `${query}${placeholder(this._params[index - 1], index - 1, this)}${part}`);
    }
}

const qDefault = q`default`;
const vDefault = (v: unknown) => v !== undefined ? v : qDefault;

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

/**
 * A raw database result set.
 *
 * This Array subclass hold rows of cells in a tabular format and metadata about the columns (name, type etc) in the
 * [[columns]] property. Additional metadata such as *row count* and *row key* is also available.
 *
 * This is an abstract class. Each database driver is expected to provide a full implementation and a concrete subclass.
 */
export abstract class DBResult extends Array<unknown[]> {
    /** Array functions return a new Array, not a DBResult. */
    static get [Symbol.species](): typeof Array {
        return Array;
    }

    /**
     * Constructs a new DBResult.
     *
     * @param _db      The DatabaseURI this result set belongs to.
     * @param columns  Metadata abount the columns in this result set.
     * @param records  The records to adopt. May be an empty array if no actual result was produced by the query.
     * @param rowCount The number of rows the query producing the result set affected.
     * @param rowKey   The primary key/unique row key the the query producing the result set generated.
     */
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

    /**
     * Initially, the column metatdata will include just the bare minumum, like the label, possibly data type and the
     * origins of the value. By calling this method, the metadata will be expanded to everything that is known about the
     * column by querying the database for more information.
     *
     * The base class implementation of this method queries the `INFORMATION_SCHEMA.COLUMNS` view based on
     * [[DBColumnInfo.table_catalog]], [[DBColumnInfo.table_schema]], [[DBColumnInfo.table_name]] and
     * [[DBColumnInfo.column_name]]. Subclasses may override or extend this method, based on how the actual database
     * provides column metadata.
     *
     * @throws DBError  On database/query errors.
     * @returns         The updated/expanded column metadata (also available in [[columns]] after this call has
     * completed).
     */
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

    /**
     * A helper method for database driver implementations that converts a DBColumnInfo-like object into an actual
     * DBColumnInfo entry.
     *
     * @param    columnRow  A DBColumnInfo-like object. Keys may be non-lowercase and values may be all strings, for
     *                      instance.
     * @returns             A DBColumnInfo.
     */
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

    /**
     * Converts this result set into a single object/record.
     *
     * The result is an object where keys are the column labels holding the values (unlike the rows in this class, where
     * each row is just an array of values).
     *
     * This method is used by [[DatabaseURI.watch]] if the event contains only a single row, which is usually the case.q
     *
     * @template T          The actual record type.
     * @param    fields     What to set `[FIELDS]` to. Defaults to `[ this ]`.
     * @throws   TypeError  If the length of this result set is not exactly 1.
     * @returns             A single record (where keys are the column labels) of the first (and only) row in the result
     *                      set.
     */
    toObject<T extends object>(fields?: DBResult[]): T & DBMetadata {
        const result: any = {};
        result[FIELDS] = fields ?? [ this ];

        if (this.length !== 1) {
            throw new TypeError(`toObject: expected 1 row, but found ${this.length} rows`);
        }

        for (let s = this[0], h = 0, hl = this.columns.length; h < hl; ++h) {
            result[this.columns[h].label || h] = s[h];
        }

        return result;
    }

    /**
     * Converts this result set into an array of object/records.
     *
     * The result is an array of object where keys are the column labels holding the values (unlike the rows in this
     * class, where each row is just an array of values).
     *
     * This method is used by [[DatabaseURI]] to convert all result sets created by the database drivers before
     * returning them to the caller.
     *
     * @template T       The actual record type.
     * @param    fields  What to set `[FIELDS]` to. Defaults to `[ this ]`.
     * @returns          An array of records (where keys are the column labels) of all the row in the result set.
     */
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

/**
 * The database URI base class defines the API for all database-specific protocols. It provides CRUD access to database
 * rows via [[load]], [[save]], [[append]], [[modify]] and [[remove]], [[query]] for executing custom queries in a
 * databases-specific query language (read "SQL") and [[watch]] for *change data capture*, provided the database and
 * driver supports it.
 *
 * Below is a list of all known supported databases:
 *
 * Database     | Database driver class
 * -------------|----------------------
 * CockroachDB  | [[PostgresURI]]
 * H2           | [[JDBCURI]]†
 * MariaDB      | [[MySQLURI]]
 * MySQL        | [[MySQLURI]]
 * PostgreSQL   | [[PostgresURI]]
 * SQL Server   | [[TDSURI]]
 * SQLite       | [[SQLiteURI]]
 *
 * † In theory, any JDBC-enabled database should have at least basic support, but our unit tests are only run against H2.
 *
 * ## CRUD row operations with *DB references*
 *
 * In order to provide CRUD (*create*, *read*, *update* and *delete*) operations for database rows, DatabaseURI uses a
 * small expression language called *DB reference* in the URI fragment to specify what table, rows and columns to
 * access. A DB reference looks like this:
 *
 * `#` *table* { `[` *keys* `]` } { `(` *columns* `)` } { `;` *scope* } { `?` *filter* } { `&` *name* `=` *value* ... }
 *
 * It always starts with a hash sign, which signals the start of the URI fragment part, followed by a reference to what
 * table to access. The *table* value may actually be a forward slash-separated table path, so it's possible to specify
 * catalog and schema as well (similar to how the dot is used in SQL).
 *
 * The remaining parts of the expression is optional (well, depeneding on what operation you're trying to perform).
 *
 * The [[save]] operation may, depending on the actual database, require the primary key in order to work. The name of
 * the primary key optionally follows the table name, enclosed by square brackets. *keys* may be a comma-separated list
 * of columns, if the primary key spans multiple columns.
 *
 * In order to limit what colomns to operate on, a list of *columns*, enclosed by parentheses, may then follow. The
 * default is all columns when reading and all the columns present in the data when writing.
 *
 * Next up: *scope*. The scope can be one of `scalar` (a single cell), `one` (a single row), `unique` (distinct rows) or
 * `all` (multiple rows). It's specifies how data should be interpreted when reading or writing.
 *
 * When reading, a *filter* specifies what rows to return. The filter part begins with a question mark followed by a
 * (possible nested) expression enclosed by parentheses. Please see *Filters* below for the filter syntax.
 *
 * Finally, one or more parameters may be specified. Currently, parameters are only defined for read operations. A
 * parameter begins with an ampersand followed by the *name* of the parameter, and equals sign (`=`) and the *value*.
 * The available parameters are `offset` (skip rows in the result set), `count` (limit the result set), `sort` (to
 * specify a sort column; precede with a dash to reverse the sort order) and `lock` (either `read` or `write`) to lock
 * the rows returned.
 *
 * ### Filters
 *
 * Relational filters are written as `(` *relation* `,` *column* `,` *value* `)`, where *relation* is one of `lt` (less
 * than), `le` (less than or equal), `eq` (equal), `ge` (greater than or equal) and `gt` (greater than). These kinds of
 * filter expressions test a column against a fixed value.
 *
 * There are also boolean filters. To require two or more filters to all be true, write `(` `and` *filter1* ...
 * *filterN* `)`. To require only one of several filters to be true, write `(` `or` *filter1* ... *filterN* `)`. It's
 * also possible to invert a filter by writing `(` `not` *filter* `)`.
 *
 * Filters may be nested, so the following filter part of a DB reference would return all products that cost between 10
 * and 20 USD as well as those being completely free:
 *
 * ```
 * #products?(or(and(ge,amount,10)(le,amount,20))(eq,amount,0))
 * ```
 *
 * This syntax, while perhaps a bit exotic for both JavaScript and SQL developers, was chosen so that filters do not
 * have to be URI-encoded when beeing included in the URI fragment.
 *
 * As a general rule, filters should be kept simple with just one or two relations. Otherwise, it's probably better to
 * simply write an SQL query instead.
 *
 * ### Examples
 *
 * So why use DB references? Well, they can save you a lot of work! Assuming `db` is your DatabaseURI, here are a few
 * examples.
 *
 * Insert a row:
 *
 * ```ts
 * const user = await db.$`#users`.append<User>({ name: 'Martin', language: 'sv', country: 'se' });
 * ```
 *
 * Insert multiple rows:
 *
 * ```ts
 * const user = await db.$`#users`.append<User[]>([
 *     { name: 'Martin', language: 'sv', country: 'se' },
 *     { name: 'Vilgot', language: 'es', country: 'mx' }
 * ]);
 * ```
 *
 * Retrieve a row:
 *
 * ```ts
 * const user = await db.$`#users;one?(eq,id,${userID})`.load<User>();
 * ```
 *
 * Retrieve multiple rows:
 *
 * ```ts
 * const users = await db.$`#users?(eq,country,mx)`.load<User[]>();
 * ```
 *
 * Update one or more rows
 *
 * ```ts
 * await db.$`#users?(eq,id,${userID})`.modify({ country: 'fi' });
 * ```
 *
 * Remove one or more rows:
 *
 * ```ts
 * await db.$`#users?(eq,id,${userID})`.remove();
 * ```
 *
 * Some databases also supports *upsert* semantics, which means the row will be created if it doesn't exist, or updated
 * if it does.
 *
 * ```ts
 * const user = await db.$`#users`.save<User>({ id: 1337, name: 'Martin', language: 'sv', country: 'se' });
 * ```
 *
 * Depending on the database, you may have to provide the name of the primary key for this call to succeed. If the
 * database supports *upsert* both with and without a primary key, it's better to omit it.
 *
 * ```ts
 * const user = await db.$`#users[id]`.save<User>({ id: 1337, name: 'Martin', language: 'sv', country: 'se' });
 * ```
 *
 * `save`, like `append`, also accepts an array for upserting multiple rows at once.
 *
 * ## Custom SQL queries
 *
 * CRUD operations beside, the main interface to databases is the SQL query, and that's what the [[query]] method is all
 * about. It has a few different signatures, but most common is to use it as a tagged template literal:
 *
 * ```ts
 * const [ user ] = await db.query<User[]>`select * from users where id = ${userID}`;
 * ```
 *
 * The `query` function always returns an array. The raw [[DBResult | result set]] is available via the [[FIELDS]]
 * symbol. Sessions are handled automatically and is usually not something you will have to worry about. However, since
 * the database connections are pooled, two consecutive queries might execute on different connections. To execute
 * multiple queries in the same session, construct [[DBQuery]] objects explicitly and pass them all to `query` (or use a
 * transaction; see below):
 *
 * ```ts
 * const id = await db.query(q`insert into users (name) values ('Martin')`, q`select last_insert_id()`);
 * ```
 *
 * Note that the generated primary key is always available as [[DBResult.rowKey]], so this particular example is a bit
 * silly.
 *
 * ## Transactions
 *
 * To execute a code block inside a transaction, pass a callback to `query`, like this:
 *
 * ```ts
 * const orderID = await db.query(async () => {
 *   const order = await db.$`orders`.append({ user_id: userID, date: new Date() });
 *   await db.$`order_lines`.append(lines.map((line) => ({ ...line, order_id: order.rowKey }));
 *
 *   return order.rowKey;
 * });
 * ```
 *
 * If the transaction fails (i.e., the callback throws an exception), the transaction will be automatically rolled back.
 * If it returns normally, it will be committed. Transactions may be nested, in which case *savepoints* will be used
 * instead. Like actual transactions, savepoints will also be rolled back if the nested callback throws.
 *
 * ### Deadlock handling
 *
 * Sometimes, conflicting transactions will deadlock. The database drivers will automatically handle this situation for
 * you (assuming the deadlock exception propagates back to `query`, of course) by restarting the transaction and
 * invoking the callback again. The callback actually receives a retry counter as its first argument, in case you need
 * to detect this. The first time you callback is called, this counter will be 0. Nested callbacks will receive `null`
 * instead of a number.
 *
 * This behaviour, as well as other transaction parameters like isolation level, may be customized by passing a
 * [[DBTransactionParams]] object as the first argument to `query`, before the callback.
 *
 * Deadlock handling is supported by all database drivers, and there is even custom handling for CockroachDB, which
 * automatically increases the transaction priority on retries.
 *
 * ## Change Data Capture
 *
 * Some drivers, like [[PostgresURI]], also implement the [[watch]] method. Use this to listen for events from the
 * database and stream the results in realtime to your application. The PostgresURI class supports `LISTEN`/`NOTIFY`
 * events when when using PostgreSQL and [core
 * changefeeds](https://www.cockroachlabs.com/docs/v21.2/changefeed-for.html) when using CockroachDB.
 *
 * ## Shutting down
 *
 * Call [[close]] to terminate the connection pool. Otherwise, it may take a minute or so before all idle connections
 * time out and Node.js exits.
 *
 */
export abstract class DatabaseURI extends URI {
    protected abstract _createDBConnectionPool(params: DBParamsSelector): DBConnectionPool | Promise<DBConnectionPool>;

    /**
     * Constructs a new DatabaseURI, relative to this URI, from a template string, percent-encoding all arguments.
     *
     * Example:
     *
     * ```ts
     * const base = new URI('sqlite:/tmp/demo.db');
     * const info = await base.$`#item_info?(eq,id,${item})`.load();
     * ```
     *
     * @param  strings    The template string array.
     * @param  values     The values to be encoded.
     * @throws TypeError  If the resulting URI is not actually a DatabaseURI.
     * @returns           A new DatabaseURI subclass instance.
     */
    override $(strings: TemplateStringsArray, ...values: unknown[]): DatabaseURI {
        const result = super.$(strings, ...values);

        if (result instanceof DatabaseURI) {
            return result;
        }
        else {
            throw new TypeError(`When using $ on a DatabaseURI, the URI type must not change`)
        }
    }

    /**
     * Uses the *DB reference* in this URI's fragment to retrieve one or multiple rows or a single cell from a table
     * with `SELECT`.
     *
     * @template  T        The actual type returned.
     * @param     _recvCT  Must not be used.
     * @throws    IOError  On I/O errors or if this URI does not have a valid *DB reference* fragment.
     * @throws    DBError  On database/query errors.
     * @returns            A cell, row or array of rows, with DBMetadata.
     */
    override load<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
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

    /**
     * Uses the *DB reference* in this URI's fragment to store one or multiple rows in a table using *upsert* semantics
     * (using `INSERT ... ON CONFLICT UPDATE ...` or `UPSERT`, for instance, but this depends on the database).
     *
     * @template  T        The actual type returned.
     * @template  D        The type of data to store.
     * @param     data     The data to store in a row (or an array of rows to store).
     * @param     _sendCT  Must not be used.
     * @param     _recvCT  Must not be used.
     * @throws    IOError  On I/O errors or if this URI does not have a valid *DB reference* fragment.
     * @throws    DBError  On database/query errors.
     * @returns            A row or array of rows (if the database supports it), with DBMetadata.
     */
    override save<T extends object, D = unknown>(data: D, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getSaveQuery(data)));
        });
    }

    /**
     * Uses the *DB reference* in this URI's fragment to add one or multiple rows in a table using `INSERT`.
     *
     * @template  T        The actual type returned.
     * @template  D        The type of data to store.
     * @param     data     The data to add to the table.
     * @param     _sendCT  Must not be used.
     * @param     _recvCT  Must not be used.
     * @throws    IOError  On I/O errors or if this URI does not have a valid *DB reference* fragment.
     * @throws    DBError  On database/query errors.
     * @returns            A row or array of rows  (if the database supports it), with DBMetadata.
     */
    override append<T extends object, D = unknown>(data: D, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getAppendQuery(data)));
        });
    }

    /**
     * Uses the *DB reference* in this URI's fragment to modify one or multiple rows in a table using `UPDATE`.
     *
     * @template  T        Object.
     * @template  D        The type of the update data.
     * @param     data     The data to update in the table.
     * @param     _sendCT  Must not be used.
     * @param     _recvCT  Must not be used.
     * @throws    IOError  On I/O errors or if this URI does not have a valid *DB reference* fragment.
     * @throws    DBError  On database/query errors.
     * @returns            Object([[VOID]]), with DBMetadata.
     */
    override modify<T extends object, D = unknown>(data: D, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getModifyQuery(data)));
        });
    }

    /**
     * Uses the *DB reference* in this URI's fragment to remove one or multiple rows from a table using `DELETE`.
     *
     * @template  T        Object.
     * @param     _recvCT  Must not be used.
     * @throws    IOError  On I/O errors or if this URI does not have a valid *DB reference* fragment.
     * @throws    DBError  On database/query errors.
     * @returns            Object([[VOID]]), with DBMetadata.
     */
    override remove<T extends object>(_recvCT?: ContentType | string): Promise<T & DBMetadata> {
        return this._session(async (conn) => {
            return toObjects<T>(await conn.query((await conn.reference(this)).getRemoveQuery()));
        });
    }

    /**
     * Executes one or more queries in the same session.
     *
     * @template T          The actual type returned. Always an array.
     * @param    queries    The queries to execute.
     * @throws   TypeError  If the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             An array of rows from the *last* query. All result sets are available as a [[DBResult]]
     *                      array via [[FIELDS]] (from the DBMetadata).
     */
    override query<T extends object = object[]>(...queries: DBQuery[]): Promise<T & DBMetadata>;
    /**
     * Executes a query in the form of a template literal.
     *
     * All values/parameters will either be quoted and encoded or sent separately to the database server for processing,
     * depending on the actual database driver. Example:
     *
     * ```ts
     * const users = dbURI.query<User>[]>`select * from users where first_name = ${firstName}`;
     * ```
     *
     * See also [[q]], [[q.quote]], [[q.raw]], [[q.join]], [[q.list]], [[q.values]] and [[q.assign]] for handy utility
     * functions.
     *
     * @template T          The actual type returned. Always an array.
     * @param    query      The query as a template string array.
     * @param    params     The query parameters. Values may be [[DBQuery]] instances or of any type supported by the
     *                      database.
     * @throws   TypeError  If one of the parameters is `undefined` or if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             An array of rows. The raw set is available as a [[DBResult]] array—of length 1—via
     *                      [[FIELDS]] (from the DBMetadata).
     */
    override query<T extends object = object[]>(query: TemplateStringsArray, ...params: (BasicTypes)[]): Promise<T & DBMetadata>;
    /**
     * Executes a query in the form of a query string. The string may contain `{prop}` placeholders, which will then be
     * resolved against properties in `params`.
     *
     * All values/parameters will either be quoted and encoded or sent separately to the database server for processing,
     * depending on the actual database driver. Example:
     *
     * ```ts
     * const users = dbURI.query<User>[]>('select * from users where first_name = {name}', { name: firstName });
     * ```
     *
     * See also [[q]], [[q.quote]], [[q.raw]], [[q.join]], [[q.list]], [[q.values]] and [[q.assign]] for handy utility
     * functions.
     *
     * @template T          The actual type returned. Always an array.
     * @param    query      The query, with `{prop}` placeholders for parameters.
     * @param    params     An record with parameters, used to look up placeholders from the query. Parameters may be
     *                      [[DBQuery]] instances themselves, or of any type supported by the database.
     * @throws   TypeError  If one of the parameters is `undefined` or if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             An array of rows. The raw set is available as a [[DBResult]] array—of length 1—via
     *                      [[FIELDS]] (from the DBMetadata).
     */
    override query<T extends object = object[]>(query: string, params: Params): Promise<T & DBMetadata>;
    /**
     * Begins a transaction and evaluates the provided callback.
     *
     * If the callback returns successfully, the transaction is committed and this method returns the callback's return
     * value; if the callback throws, the transaction is rolled back and the exception is propagated.
     *
     * Transaction deadlocks are handled automatically by default. When the driver detects that a transaction was
     * aborted because of a deadlock, it waits a little based on the [[DBTransactionParams.backoff]] function, and then
     * invokes the callback again (the `retryCount` argument will be 1 on the first retry and so on), up to a maximum of
     * [[DBTransactionParams.retries]] times. Only then will the deadlock exception be propagated. To this behaviour,
     * set `retry` to 0.
     *
     * If this method is called recursively, *savepoints* will be created (and rolled back) instead of transactions, and
     * `params` will be *silently ignored*. The `retryCount` argument is set to `null` in this case.
     *
     * @template T          The return type of the callback.
     * @param    params     Transaction options, specifying the number of retries on deadlocks, the backoff strategey or
     *                      transaction isolation level.
     * @param    cb         The function to evaluate inside the transaction/savepoint.
     * @throws   TypeError  if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @throws   unknown    Any exception thrown by `cb` is propagated.
     * @returns             Whatever `cb` returns.
     */
    override query<T>(params: DBTransactionParams, cb: DBCallback<T>): Promise<T>;
    /**
     * Begins a transaction and evaluates the provided callback.
     *
     * If the callback returns successfully, the transaction is committed and this method returns the callback's return
     * value; if the callback throws, the transaction is rolled back and the exception is propagated.
     *
     * Transaction deadlocks are handled automatically. When the driver detects that a transaction was aborted because
     * of a deadlock, it waits a few hundred milliseconds, and then invokes the callback again (the `retryCount`
     * argument will be 1 on the first retry and so on), up to a maximum of 8 times. Only then will the deadlock
     * exception be propagated. The wait time is approximately doubled on each retry, up to around 12 seconds.
     *
     * If this method is called recursively, *savepoints* will be created (and rolled back) instead of transactions. The
     * `retryCount` argument is set to `null` in this case.
     *
     * @template T          The return type of the callback.
     * @param    cb         The function to evaluate inside the transaction/savepoint.
     * @throws   TypeError  if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @throws   unknown    Any exception thrown by `cb` is propagated.
     * @returns             Whatever `cb` returns.
     */
    override query<T>(cb: DBCallback<T>): Promise<T>;
    override async query<T>(first: DBQuery | TemplateStringsArray | string | DBTransactionParams | DBCallback<T>, ...rest: unknown[]): Promise<unknown & Metadata & WithFields<DBResult>> {
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

    /**
     * Opens a *change data capture* channel to the database and returns a stream of change events.
     *
     * Example:
     *
     * ```ts
     * for await (const ev of dbURI.watch(q`listen foo`)) {
     *     console.log('New PostgreSQL notification', ev);
     * }
     * ```
     *
     * @template T          The type of events that will be emitted.
     * @param    query      The query that opens the change event stream.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             A stream of change events.
     */
    override watch<T extends object>(query: DBQuery): AsyncIterable<T & DBMetadata>;
    /**
     * Opens a *change data capture* channel to the database and returns a stream of change events.
     *
     * ```ts
     * for await (const ev of dbURI.watch`experimental changefeed FOR orders`) {
     *     console.log('New order from CockroachDB', ev);
     * }
     * ```
     *
     * @template T          The type of events that will be emitted.
     * @param    query      The query that opens the change event stream.
     * @param    params     The query parameters. Values may be [[DBQuery]] instances or of any type supported by the
     *                      database.
     * @throws   TypeError  If one of the parameters is `undefined` or if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             A stream of change events.
     */
    override watch<T extends object>(query: TemplateStringsArray, ...params: unknown[]): AsyncIterable<T & DBMetadata>;
    /**
     * Opens a *change data capture* channel to the database and returns a stream of change events.
     *
     * ```ts
     * for await (const ev of dbURI.watch('experimental changefeed FOR orders', {})) {
     *     console.log('New order from CockroachDB', ev);
     * }
     * ```
     *
     * @template T          The type of events that will be emitted.
     * @param    query      The query that opens the change event streamq, with `{prop}` placeholders for parameters.
     * @param    params     An record with parameters, used to look up placeholders from the query. Parameters may be
     *                      [[DBQuery]] instances themselves, or of any type supported by the database.
     * @throws   TypeError  If one of the parameters is `undefined` or if the arguments are invalid.
     * @throws   IOError    On I/O errors.
     * @throws   DBError    On database/query errors.
     * @returns             A stream of change events.
     */
    override watch<T extends object>(query: string, params: Params): AsyncIterable<T & DBMetadata>;
    override async *watch<T extends object>(query: DBQuery | TemplateStringsArray | string, ...rest: unknown[]): AsyncIterable<unknown & DBMetadata> {
        const results = new Signal<AsyncIterable<DBResult>>();
        const barrier = new Barrier(2);
        const session = this._session(async (conn) => {
            if (!conn.watch) {
                throw new IOError(`URI ${this} does not support watch()`);
            }

            results.notify(conn.watch(query instanceof DBQuery ? query : q(query as any, ...rest)));
            await barrier.wait();
        }).catch(async (err) => {
            results.notify(new AsyncIteratorAdapter<DBResult>().throw(err));
            await barrier.wait();
        })

        try {
            return yield* mapped((results.value ?? await results.wait()), (v) => v.length === 1 ? v.toObject<T>() : v.toObjects<T>());
        }
        catch (err) {
            throw this._makeIOError(err);
        }
        finally {
            await barrier.wait();
            await session;
        }
    }

    /**
     * Shuts down the database connection pool.
     *
     * @throws IOError  On I/O errors.
     */
    override async close(): Promise<void> {
        try {
            const states = this._getBestSelector<DBSessionSelector>(this.selectors.session)?.states;

            if (states) {
                const database = states.database;
                delete states.database;
                await database?.close();
            }
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    private async _session<T>(cb: (connection: DBConnection) => Promise<T>): Promise<T> {
        try {
            let states = this._getBestSelector<DBSessionSelector>(this.selectors.session)?.states;

            if (!states) {
                states = {};
                this.addSelector({ selector: { uri: this.href.replace(/#.*/, '') }, states });
            }

            if (!states.database) {
                const params = this._getBestSelector<DBParamsSelector>(this.selectors.params);
                states.database = await this._createDBConnectionPool(params ?? { params: {} });
            }

            return await states.database!.session(cb);
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }
}
