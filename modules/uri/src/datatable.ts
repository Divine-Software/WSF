import { isOneOf, throwError } from '@divine/commons';
import { DatabaseURI, dbRef, DBResult } from './protocols/database';
import { SafeURIString, uri } from './uri';
import { FIELDS, Metadata, unwrap, Wrap, wrap } from './uri-types';

type PreconditionMode = 'always' | 'never' | 'present' | 'absent' | 'match' | 'none-match' | 'unmodified-since' | 'modified-since';

/**
 * Represents a conditional constraint that can be evaluated against a resource
 * version and/or last-modified timestamp.
 *
 * The supported modes map to common HTTP precondition semantics (RFC 9110),
 * allowing callers to enforce optimistic concurrency and conditional operations.
 *
 * For date-based modes (`unmodified-since` / `modified-since`), HTTP semantics
 * are applied: invalid dates or missing resource timestamps do not make the
 * condition fail and are treated as if the date condition is ignored.
 */
export class Precondition {
    private _evaluated = false;
    private _versions?: string[];
    private _timestamp?: Date;

    /**
     * Creates a precondition that is independent of specific versions or dates.
     *
     * - `always`: always succeeds.
     * - `never`: always fails.
     * - `present`: succeeds when a current version exists.
     * - `absent`: succeeds when no current version exists (null).
     */
    constructor(mode: 'always' | 'never' | 'present' | 'absent');
    /**
     * Creates a version-based precondition.
     *
     * - `match`: succeeds when the current version matches one of `versions`.
     * - `none-match`: succeeds when the current version matches none of `versions`.
     */
    constructor(mode: 'match' | 'none-match', ...versions: string[]);
    /**
     * Creates a timestamp-based precondition.
     *
     * - `unmodified-since`: succeeds when the resource has not been modified since `version`.
     * - `modified-since`: succeeds when the resource has been modified since `version`.
     */
    constructor(mode: 'unmodified-since' | 'modified-since', version: Date);
    constructor(public readonly mode: PreconditionMode, versionOrDate?: string | Date, ...extraVersions: string[]) {
        if (typeof versionOrDate === 'string') {
            this._versions = [versionOrDate, ...extraVersions];
        } else if (versionOrDate instanceof Date && !isNaN(versionOrDate.getTime())) {
            // RFC 9110 13.1.3-4: Date conditions should be ignored if date is invalid
            this._timestamp = new Date(versionOrDate.toString()); // No milliseconds
        }
    }

     /**
      * Evaluates this precondition.
      *
      * @param version    Current resource version. Use `null` to represent "known to be absent". Use `undefined` when
      *                   the version state is not available.
      * @param timestamp  Current resource timestamp (e.g. last modified date). For date-based modes, this follows HTTP
      *                   semantics (RFC 9110): if either side has no valid date, the date precondition is ignored.
      * @returns          `true` if the precondition passes, otherwise `false`.
      */
    test(version?: string | null, timestamp?: Date | string): boolean {
        timestamp = timestamp ? new Date(timestamp.toString()) : undefined; // No milliseconds

        this._evaluated = true;

        // RFC 9110 13.1.3-4: Date conditions should be ignored if date is invalid or if the resource have no timestamp.
        switch (this.mode) {
            case 'always':           return true;
            case 'never':            return false;
            case 'present':          return version !== undefined && version !== null;
            case 'absent':           return version !== undefined && version === null;
            case 'match':            return version !== undefined && (!!this._versions?.length && isOneOf(version, this._versions));
            case 'none-match':       return version !== undefined && (!this._versions?.length || !isOneOf(version, this._versions));
            case 'unmodified-since': return !timestamp || !this._timestamp || timestamp.getTime() <= this._timestamp.getTime();
            case 'modified-since':   return !timestamp || !this._timestamp || timestamp.getTime() >  this._timestamp.getTime();
        }
    }

    /**
     * Indicates whether {@link test} has been called.
     *
     * @returns `true` after this instance has been evaluated at least once.
     */
    get evaluated(): boolean {
        return this._evaluated;
    }
}

/**
 * Error raised by {@link DataTable} operations for normal, anticipated failure cases.
 *
 * The error code is stable and intended for programmatic handling.
 */
export class DTError extends RangeError {
    /**
     * Creates a new {@link DataTable} error.
     *
     * @param code  The DataTable failure code.
     */
    constructor(public code: 'not-found' | 'precondition-failed') {
        super(code);
    }

    /** @returns This DTError represented as a string. */
    override toString(): string {
        return `[${this.constructor.name}: ${this.code}]`
    }
}

export const DT_METADATA = Symbol('DT_METADATA');

/**
 * Common metadata attached to wrapped values, records and record collections
 * returned by {@link DataTable} operations.
 */
export interface DTMetadata extends Metadata {
    /**
     * Hidden metadata payload attached to the result object/array.
     */
    [DT_METADATA]: {
        /** `true` if the result was created during the operation, `false` if it was written, `undefined` otherwise. */
        created?:    boolean;

        /** Last-modified timestamp of the resource/table, when available. */
        timestamp?:  Date;

        /** Total number of records, typically set on list/table responses. */
        totalCount?: number;

        /** Version/ETag-like identifier of the resource, when available. */
        version?:    string | null;
    }
}

/**
 * Common filter options used by list operations.
 */
export interface DTFilter {
    /** Backend-specific where/filter expression. */
    where?:  unknown;

    /** What property to sort by. */
    order?:  string;

    /** Maximum number of rows to return. */
    limit?:  number;

    /** Number of rows to skip before returning results. */
    offset?: number;
}

/**
 * Supported record key/identifier types.
 */
export type DTKey = string | number | bigint;

/**
 * Authorization callback used to mediate access to records and operations.
 *
 * `current` is the value currently present in the table (or `null` if absent). It must not be modified.
 *
 * `next` is only provided for write operations and resolves to the value that is about to be written to the table.
 *
 * The callback must return the value that should be written (for write operations) or returned (for non-write
 * operations). In practice this means returning `current` when `next` is absent, or `await next()` when present, unless
 * access rules require a different outcome.
 *
 * Authorizers may compare `current` and `await next()` to enforce business rules or for property-level access control.
 */
export type DTAuthorizer<K extends DTKey, T extends object> = ((key: K | null, current: Readonly<T & DTMetadata> | null, next?: () => Promise<T | null>) => Promise<T | null>);

/**
 * A no-op authorizer that applies no authorization logic.
 *
 * @param _key     Record key (ignored).
 * @param current  Value currently present in the table, or `null` if absent.
 * @param next     Write-operation callback returning the value to be written.
 * @returns        The value to be written (`next()`) or returned (`current`).
 */
export const noAuth: DTAuthorizer<string, any> = (_key, current, next) => next ? next() : Promise.resolve(current);

/**
 * DataTable operation contract for CRUD-like resource access with metadata,
 * authorization and conditional update/delete support.
 *
 * Methods that accept a `precondition` may throw `DTError('precondition-failed')`
 * if the precondition does not pass.
 */
export interface DataTable<K extends DTKey, E extends object, T extends object = E> {
    /**
     * Returns table-level metadata.
     *
     * @returns Table/resource metadata, such as last-modified timestamp and version.
     */
    info?(): Promise<Wrap<undefined> & DTMetadata>;

    /**
     * Returns a list of records.
     *
     * @param authorize  Authorization callback for the list result.
     * @param filter     Optional list filter/sort/paging options.
     * @returns          A list of records with attached {@link DTMetadata}.
     */
    list?(authorize: DTAuthorizer<K, T[]>, filter?: DTFilter): Promise<T[] & DTMetadata>;

    /**
     * Loads one record by key.
     *
     * @param authorize  Authorization callback for the loaded record.
     * @param key        Record key.
     * @throws {DTError} With code `not-found` if no matching record exists.
     * @returns          The loaded record with attached {@link DTMetadata}.
     */
    load?(authorize: DTAuthorizer<K, T>, key: K): Promise<T & DTMetadata>;

    /**
     * Creates or replaces a record for a key.
     *
     * @param authorize     Authorization callback for the operation.
     * @param key           Record key.
     * @param entity        Input entity data.
     * @param precondition  Optional conditional guard that must pass before write.
     * @throws {DTError}    With code `precondition-failed` if `precondition` does not pass.
     * @throws {DTError}    With code `not-found` if no matching record exists and the table does not support creating
     *                      new records with user-defined keys.
     * @returns             The saved record with attached {@link DTMetadata}.
     */
    save?(authorize: DTAuthorizer<K, T>, key: K, entity: E, precondition?: Precondition): Promise<T & DTMetadata>;

    /**
     * Appends/creates a new record.
     *
     * @param authorize     Authorization callback for the operation.
     * @param entity        Input entity data.
     * @param precondition  Optional table-level conditional guard.
     * @throws {DTError}    With code `precondition-failed` if `precondition` does not pass.
     * @returns             The created record with attached {@link DTMetadata}.
     */
    append?(authorize: DTAuthorizer<K, T>, entity: E, precondition?: Precondition): Promise<T & DTMetadata>;

    /**
     * Modifies an existing record.
     *
     * `transform` can be either a partial patch object or a function that
     * receives the current record and returns the updated record.
     *
     * @param authorize     Authorization callback for the operation.
     * @param key           Record key.
     * @param transform     Patch object or transformation function.
     * @param precondition  Optional conditional guard that must pass before write.
     * @throws {DTError}    With code `not-found` if no matching record exists.
     * @throws {DTError}    With code `precondition-failed` if `precondition` does not pass.
     * @returns             The modified record with attached {@link DTMetadata}.
     */
    modify?(authorize: DTAuthorizer<K, T>, key: K, transform: Partial<E> | ((current: T) => T | Promise<T>), precondition?: Precondition): Promise<T & DTMetadata>;

    /**
     * Removes a record by key.
     *
     * Authorizers may override deletion by returning a replacement record.
     *
     * @param authorize     Authorization callback for the operation.
     * @param key           Record key.
     * @param precondition  Optional conditional guard that must pass before delete.
     * @throws {DTError}    With code `not-found` if no matching record exists.
     * @throws {DTError}    With code `precondition-failed` if `precondition` does not pass.
     * @returns             Either metadata-wrapped `null` (deleted) or a record
     *                      with attached {@link DTMetadata}.
     */
    remove?(authorize: DTAuthorizer<K, T>, key: K, precondition?: Precondition): Promise<T & DTMetadata | Wrap<null> & DTMetadata>;
}

// export interface DataTableView<K extends DTKey, E extends object, T extends object, DT extends DataTable<DTKey, object, object>> {
//     info:   (DT['info']   extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['info'];
//     list:   (DT['list']   extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['list'];
//     load:   (DT['load']   extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['load'];
//     save:   (DT['save']   extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['save'];
//     append: (DT['append'] extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['append'];
//     modify: (DT['modify'] extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['modify'];
//     remove: (DT['remove'] extends (...args: never) => unknown ? never: undefined) | Required<DataTable<K, E, T>>['remove'];
// }

// export interface DataTableViewMappers {
//     fromSourceType?<S, T>(source: S & DTMetadata): T & DTMetadata;
//     toSourceType?<S, T>(type: T): S;
//     fromSourceEntity?<S, E>(source: S & DTMetadata): E & DTMetadata;
//     toSourceEntity?<S, E>(entity: E): S;
// }

// type TypeParameters<G> = G extends DataTable<infer K, infer E, infer T> ? [K, E, T] : never;

// export function dataTableView<E extends object = object, T extends object = object, DT extends DataTable<string, object, object> = DataTable<string, object, object>>(
//     dataTable: DT,
//     toSourceEntity: (entity: E) => TypeParameters<DT>[1],
//     toSourceType: (type: T) => TypeParameters<DT>[2],
//     fromSourceType: (source: TypeParameters<DT>[2] & DTMetadata) => T & DTMetadata
// ) {
//     const authorizer = () => {};

//     const result = {
//         info: dataTable.info?.bind(dataTable),

//         list: dataTable.list && ((authorize, filter) => {
//             return dataTable.list(authorizer,
//             (async (key, current, next) => {
//                 const sourceList = await next();
//                 const list = sourceList ? sourceList.map(fromSourceType) : null;
//                 return authorize(key, current, () => Promise.resolve(list));
//             }, filter)
//         }),
//     } satisfies DataTable<TypeParameters<DT>[0], E, T>;

//     return result as DataTableView<TypeParameters<DT>[0], E, T, DT>;
// }

/**
 * Record-level metadata model used by storage adapters.
 */
export interface DTRecordMetadata {
    /** Last-modified timestamp of the record or table, when available. */
    timestamp?:  Date;

    /** Version/ETag-like identifier of the record or table, when available. */
    version?:    string | null;
}

/**
 * Table-level metadata model used by storage adapters.
 */
export interface DTTableMetadata extends DTRecordMetadata {
    /** Total amount of records in the table/resource. */
    totalCount?: number | bigint;
}

/**
 * Template-method base class for {@link DataTable} implementations.
 *
 * Subclasses should implement the storage hooks (`dtb*`) and record/table
 * metadata hooks. This base class handles authorization, preconditions,
 * transactions, metadata decoration and common CRUD flow.
 */
export abstract class DataTableBase<K extends DTKey, E extends object, T extends object = E> implements DataTable<K, E, T> {
    /**
     * Implement this method to create a persistence-ready record from a user-provided base entity.
     *
     * You should probably ensure that the primary key is correctly set on the returned record. If you have a "created"
     * timestamp column/property, you should always copy it from the `current` record when present, so the user cannot
     * modify it.
     *
     * Any other fields that is required in `T` but not present in `E` should also be added to the returned record,
     * unless the storage layer can generate them automatically (e.g. default values, auto-generated keys).
     *
     */
    protected abstract makeRecord(key: K | null, current: Readonly<T & DTMetadata> | null, entity: E | T): T;

    /**
     * Implement this method to provide metadata (timestamp and/or version) for a single persisted record.
     */
    protected abstract recordMetadata(record: Readonly<T>): DTRecordMetadata | Promise<DTRecordMetadata>;

    /**
     * Implement this method to provide table-level metadata (last-modified timestamp and/or version).
     *
     * If `extended` is `true`, the returned metadata *may* also include the `totalCount` field, to indicate the total
     * number of records in the table. This can be expensive to obtain for some storage backends.
     *
     * @param extended  `true` for more complete metadata, `false` for minimal metadata.
     */
    protected abstract tableMetadata(extended: boolean): DTTableMetadata | Promise<DTTableMetadata>;

    /**
     * Implement this method to execute one unit of work with storage-specific transaction semantics.
     *
     * @param mode  Transaction intent (`write` or `read`).
     * @param cb    Callback containing one logical unit of work.
     * @returns     The callback result.
     */
    protected abstract dtbTransaction<T>(mode: 'write' | 'read', cb: () => Promise<T>): Promise<T>;

    /**
     * Implement this method to list records from storage based on `filter`.
     *
     * @param filter  Optional list filter/sort/paging options.
     * @returns       Loaded records and, optionally, the total record count if the record set was truncated.
     */
    protected abstract dtbList(filter?: DTFilter): Promise<{ records: T[], totalCount?: number | bigint }>;

    /**
     * Implement this method to load one record from storage, optionally also acquiring a lock for write or read access.
     *
     * @param key   Record key.
     * @param lock  Optional lock mode for the read operation.
     * @returns     The loaded record, or `null` if no record exists for `key`.
     */
    protected abstract dtbLoad(key: K, lock?: 'write' | 'read'): Promise<T | null>;

    /**
     * Implement this method to insert one record into storage.
     *
     * @param record  Record to insert.
     * @returns       Inserted record as returned by the backend.
     */
    protected abstract dtbAppend(record: T): Promise<T>;

    /**
     * Implement this method to update/replace one record already present in storage.
     *
     * @param key     Record key.
     * @param record  Replacement record payload.
     * @returns       Updated record as returned by the backend.
     */
    protected abstract dtbModify(key: K, record: T): Promise<T>;

    /**
     * Implement this method to remove one record from storage.
     *
     * @param key  Record key.
     */
    protected abstract dtbRemove(key: K): Promise<void>;

    /**
     * Authorization hook used by all CRUD methods.
     *
     * Override to provide validation of the record(s) returned by the user-provided authorizer, for example to enforce
     * business rules or to restrict the value of certain properties.
     *
     * @param authorize  The authorizer callback provided by the caller.
     * @param key        Record key or `null` for list/append operations.
     * @param current    Value(s) currently present in the table, or `null` if absent.
     * @param next       Write-operation callback returning the value to be written.
     * @returns          The authorizer result value.
     */
    protected dtbAuthorize<R extends T | T[]>(authorize: DTAuthorizer<K, R>, key: K | null, current: Readonly<R & DTMetadata> | null, next?: () => Promise<R | null>): Promise<R | null> {
        return authorize(key, current, next);
    }

    /**
     * Evaluates a precondition and throws when it fails.
     *
     * @param precondition  Precondition to evaluate.
     * @param version       Current version/etag value.
     * @param timestamp     Current timestamp value.
     * @throws {DTError}    With code `precondition-failed` if the precondition does not pass.
     */
    protected dtbPrecondition(precondition: Precondition | undefined, version?: string | null, timestamp?: Date): void {
        if (precondition && !precondition.test(version, timestamp)) {
            throw new DTError('precondition-failed');
        }
    }

    /**
     * Error mapping hook, invoked when any dtb* method throws an error.
     *
     * By default, errors are re-thrown unchanged. Override to translate backend errors into domain errors.
     *
     * @param err      Error raised by backend/storage code.
     * @throws {Error} By default, the original error is re-thrown.
     */
    protected dtbError(err: Error): never {
        throw err;
    }

    /**
     * Returns a narrowed view exposing only selected operations.
     *
     * @param ops  Operations to expose in the returned view.
     * @returns    A DataTable view with non-selected methods unset.
     */
    subset<M extends keyof DataTable<K, E, T>>(...ops: M[]): Required<Pick<DataTable<K, E, T>, M>> {
        const dt = Object.create(this) as Required<Pick<DataTable<K, E, T>, M>>

        for (const op of ['info', 'list', 'load', 'save', 'append', 'modify', 'remove'] as M[]) {
            if (!ops.includes(op)) {
                dt[op] = undefined;
            }
        }

        return dt;
    }

    async info(): Promise<Wrap<undefined> & DTMetadata> {
        const rsrcMetadata = await this.tableMetadata(true);

        return Object.defineProperty(wrap(undefined) as Wrap<undefined> & DTMetadata, DT_METADATA, { configurable: true, value: {
            timestamp:  rsrcMetadata.timestamp,
            totalCount: typeof rsrcMetadata.totalCount === 'bigint' ? Number(rsrcMetadata.totalCount) : rsrcMetadata.totalCount,
            version:    rsrcMetadata.version,
        } satisfies DTMetadata[typeof DT_METADATA]});
    }

    async list(authorize: DTAuthorizer<K, T[]>, filter?: DTFilter): Promise<T[] & DTMetadata> {
        return await this.dtbTransaction('read', async () => {
            const rsrcMetadata = await this.tableMetadata(false);
            const listResponse = await this.dtbList(filter).catch(err => this.dtbError(err));
            const listMetadata = (list: T[]) => Object.defineProperty(list as T[] & DTMetadata, DT_METADATA, { configurable: true, value: {
                timestamp:  rsrcMetadata.timestamp,
                totalCount: typeof listResponse.totalCount === 'bigint' ? Number(listResponse.totalCount) : listResponse.totalCount,
                version:    rsrcMetadata.version,
            } satisfies DTMetadata[typeof DT_METADATA] });

            return listMetadata(await this.dtbAuthorize(authorize, null, listMetadata(listResponse.records)) ?? throwError('No list returned from authorizer.'));
        }).catch(err => this.dtbError(err));
    }

    async load(authorize: DTAuthorizer<K, T>, key: K): Promise<T & DTMetadata> {
        const current = await this._recordMetadata(await this.dtbLoad(key).catch(err => this.dtbError(err)));
        return await this._recordMetadata(await this.dtbAuthorize(authorize, key, current)) ?? throwError(new DTError('not-found'));
    }

    async save(authorize: DTAuthorizer<K, T>, key: K, entity: E, precondition?: Precondition): Promise<T & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await this.dtbAuthorize(authorize, key, current, async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                this.dtbPrecondition(precondition, version, timestamp);

                return this.makeRecord(key, current, entity);
            }) ?? throwError('No object returned from authorizer.');

            const record = current
                ? await this.dtbModify(key, this._toUpdateRow(current, updated)).catch(err => this.dtbError(err))
                : await this.dtbAppend(updated).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, current === null) ?? throwError('dtbModify/dtbAppend did not return a record.');
        }).catch(err => this.dtbError(err));
    }

    async append(authorize: DTAuthorizer<K, T>, entity: E, precondition?: Precondition): Promise<T & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const created = await this.dtbAuthorize(authorize, null, null, async () => {
                if (precondition) {
                    const { version, timestamp } = await this.tableMetadata(false);
                    this.dtbPrecondition(precondition, version, timestamp);
                }

                return this.makeRecord(null, null, entity);
            }) ?? throwError('No object returned from authorizer.');

            const record = await this.dtbAppend(created).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, true) ?? throwError('dtbAppend did not return a record.');
        }).catch(err => this.dtbError(err));
    }

    async modify(authorize: DTAuthorizer<K, T>, key: K, transform: Partial<E> | ((current: T) => T | Promise<T>), precondition?: Precondition): Promise<T & DTMetadata> {
        const transformer = typeof transform === 'function' ? transform : (current: T) => Object.assign(current, transform);

        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await this.dtbAuthorize(authorize, key, current, async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                this.dtbPrecondition(precondition, version, timestamp);

                return this.makeRecord(key, current, await transformer(structuredClone(current ?? throwError(new DTError('not-found')))));
            }) ?? throwError('No object returned from authorizer.');

            const record = await this.dtbModify(key, this._toUpdateRow(current, updated)).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, false) ?? throwError('dtbModify did not return a record.');
        }).catch(err => this.dtbError(err));
    }

    async remove(authorize: DTAuthorizer<K, T>, key: K, precondition?: Precondition): Promise<T & DTMetadata | Wrap<null> & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await this.dtbAuthorize(authorize, key, current, async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                this.dtbPrecondition(precondition, version, timestamp);

                if (!current) {
                    throw new DTError('not-found');
                } else {
                    return null;
                }
            });

            if (updated /* next() return value overridden by authorizer */) {
                const record = await this.dtbModify(key, this._toUpdateRow(current, updated)).catch(err => this.dtbError(err));
                return await this._recordMetadata(record, false) ?? throwError('dtbModify did not return a record.');
            } else {
                await this.dtbRemove(key).catch(err => this.dtbError(err));
                return Object.defineProperty(wrap(null) as Wrap<null> & DTMetadata, DT_METADATA, { value: { version: null} });
            }
        }).catch(err => this.dtbError(err));
    }

    private async _recordMetadata(record: T | null, created?: boolean): Promise<T & DTMetadata | null> {
        if (record) {
            const md = await this.recordMetadata(record);

            return Object.defineProperty(record as T & DTMetadata, DT_METADATA, { configurable: true, value: {
                created:    created,
                timestamp:  md.timestamp,
                version:    md.version,
            } satisfies DTMetadata[typeof DT_METADATA] });
        } else {
            return null;
        }
    }

    private _toUpdateRow(current: T | null, entity: T): T {
        if (!Array.isArray(entity)) { // Don't add undefined entries to arrays
            for (const col in current) {
                if (!(col in entity)) {
                    (entity as any)[col] = undefined; // Ensure all known columns are present
                }
            }
        }

        return entity;
    }
}

/**
 * Database-specific filter extension where `where` is a *DB Reference* expression.
 */
export interface DBDTFilter extends DTFilter {
    where?: SafeURIString;
}

/**
 * Database-backed {@link DataTableBase} implementation.
 *
 * This class provides a concrete `dtb*` hook implementation using {@link DatabaseURI}. Subclasses may override
 * row/record mapping behavior.
 */
export abstract class DBDataTable<K extends DTKey, E extends object, T extends object = E> extends DataTableBase<K, E, T> {
    /**
     * @param _db        Database URI.
     * @param _table     Database table name.
     * @param _keyName   Record key column/property name.
     * @param _subquery  Optional subspace query for multi-tenancy or logical separation within the same table.
     */
    constructor(protected _db: DatabaseURI, protected _table: string | SafeURIString, protected _keyName: string, protected _subquery?: SafeURIString) {
        super();
    }

    /**
     * Builds a database reference URI for list/load/modify/remove operations.
     *
     * Subclasses can override this to implement custom query-building logic or to restrict access to a subset of the
     * data. The default implementation supports filtering based on *DB Reference* expressions.
     *
     * @param scope   Query scope (`one` or `all`).
     * @param filter  Key/filter expression.
     * @param lock    Optional lock mode.
     * @returns       A DatabaseURI with a suitable *DB reference* for the operation.
     */
    protected dbRef(scope: 'one' | 'all', filter?: K | DBDTFilter | SafeURIString, lock?: 'write' | 'read'): DatabaseURI {
        let query = uri`#${this._table};${scope}`;

        const subquery = (filter?: SafeURIString) => this._subquery && filter ? dbRef('and', this._subquery, filter) : (this._subquery ?? filter);

        if (filter instanceof SafeURIString) {
            query = uri`${query}?${subquery(filter)}`;
        } else if (typeof filter === 'string' || typeof filter === 'number' || typeof filter === 'bigint') {
            query = uri`${query}?${subquery(dbRef('eq', this._keyName, filter))}`;
        } else if (filter) {
            if (filter.where || this._subquery) {
                query = uri`${query}?${subquery(filter.where)}`;
            }

            if (filter.order) {
                query = uri`${query}&order=${filter.order}`;
            }

            if (filter.limit !== undefined) {
                query = uri`${query}&limit=${filter.limit}`;
            }

            if (filter.offset !== undefined) {
                query = uri`${query}&offset=${filter.offset}`;
            }
        }

        if (lock) {
            query = uri`${query}&lock=${lock}`;
        }

        return this._db.$`${query}`;
    }

    /**
     * Converts a record to the actual table row format used for persistence.
     *
     * The default implementation assumes a 1:1 mapping between record properties and table columns, but subclasses can
     * override this to implement custom mapping logic.
     *
     * @param record  Typed record.
     * @returns       Storage row object.
     */
    protected dbRecordToRow(record: T): object {
        return record;
    }

    /**
     * Converts a table row from persistence into a record.
     *
     * The default implementation assumes a 1:1 mapping between record properties and table columns, but subclasses can
     * override this to implement custom mapping logic.
     *
     * @param row  Storage row object.
     * @returns    Typed record.
     */
    protected dbRowToRecord(row: object): T {
        return row as T;
    }

    /**
     * Resolves the key of an inserted record.
     *
     * The default implementation first tries to read the key from the inserted record, then falls back to the `rowKey`
     * property of the database result (for auto-generated keys returned by the database). Subclasses can override this
     * to implement custom key resolution logic.
     *
     * @param record    The inserted record.
     * @param dbResult  Raw database operation result.
     * @returns         Resolved record key.
     */
    protected dbInsertedKey(record: T, dbResult: DBResult): K {
        return (record[this._keyName as keyof T] ?? dbResult.rowKey) as K ?? throwError('Unable to get key of inserted record.');
    }

    protected override async dtbTransaction<T>(mode: 'write' | 'read', cb: () => Promise<T>): Promise<T> {
        return this._db.query<T>((_retries) => cb());
    }

    protected override async dtbList(filter?: DBDTFilter): Promise<{ records: T[]; totalCount?: number | bigint; }> {
        return await this.dbRef('all', filter ?? {}).load<object[]>().then(records => ({
            records:    records.map(r => this.dbRowToRecord(r)),
            totalCount: records[FIELDS][0]?.totalCount
        }));
    }

    protected override async dtbLoad(key: K, lock?: 'write' | 'read'): Promise<T | null> {
        const row = unwrap(await this.dbRef('one', key, lock).load<object | undefined>());
        return row ? this.dbRowToRecord(row) : null;
    }

    protected override async dtbModify(key: K, record: T): Promise<T> {
        const row = unwrap(await this.dbRef('one', key).modify<object | undefined>(this.dbRecordToRow(record)))
        return row ? this.dbRowToRecord(row) : await this.dtbLoad(key) ?? throwError('Failed to reload modified entity.');
    }

    protected override async dtbAppend(record: T): Promise<T> {
        const res = await this.dbRef('one').append<object | undefined>(this.dbRecordToRow(record));
        const row = unwrap(res);
        return row ? this.dbRowToRecord(row) : await this.dtbLoad(this.dbInsertedKey(record, res[FIELDS][0])) ?? throwError('Failed to reload appended entity.');
    }

    protected override async dtbRemove(key: K): Promise<void> {
        await this.dbRef('one', key).remove();
    }
}
