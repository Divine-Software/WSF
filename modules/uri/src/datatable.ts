import { isOneOf, throwError } from '@divine/commons';
import { DatabaseURI, DBResult } from './protocols/database';
import { uri, URIString } from './uri';
import { FIELDS, Metadata, unwrap, Wrap, wrap } from './uri-types';

type PreconditionMode = 'always' | 'never' | 'present' | 'absent' | 'match' | 'none-match' | 'unmodified-since' | 'modified-since';

export class Precondition {
    private _evaluated = false;
    private _versions?: string[];
    private _timestamp?: Date;

    constructor(mode: 'always' | 'never' | 'present' | 'absent');
    constructor(mode: 'match' | 'none-match', ...versions: string[]);
    constructor(mode: 'unmodified-since' | 'modified-since', version: Date);
    constructor(public readonly mode: PreconditionMode, versionOrDate?: string | Date, ...extraVersions: string[]) {
        if (typeof versionOrDate === 'string') {
            this._versions = [versionOrDate, ...extraVersions];
        } else if (versionOrDate instanceof Date && !isNaN(versionOrDate.getTime())) {
            // RFC 9110 13.1.3-4: Date conditions should be ignored if date is invalid
            this._timestamp = new Date(versionOrDate.toString()); // No milliseconds
        }
    }

    assert(version?: string | null, timestamp?: Date): void {
        if (!this.test(version, timestamp)) {
            throw new DTError('precondition-failed');
        }
    }

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

    get evaluated(): boolean {
        return this._evaluated;
    }
}

export class DTError extends RangeError {
    constructor(public code: 'not-found' | 'precondition-failed') {
        super(code);
    }

    /** @returns This DTError represented as a string. */
    override toString(): string {
        return `[${this.constructor.name}: ${this.code}]`
    }
}

export const DT_METADATA = Symbol('DT_METADATA');

export interface DTMetadata extends Metadata {
    [DT_METADATA]: {
        created?:    boolean;
        timestamp?:  Date;
        totalCount?: number;
        version?:    string | null;
    }
}

export interface DTFilter {
    where?:  unknown;
    order?:  string;
    limit?:  number;
    offset?: number;
}

export type DTKey = string | number | bigint;
export type DTAuthorizer<K extends DTKey, T extends object> = ((key: K | null, current: T & DTMetadata | null, next?: () => Promise<T | null>) => Promise<T | null>);
export const noAuth: DTAuthorizer<string, any> = (_key, current, next) => next ? next() : Promise.resolve(current);

export interface DataTable<K extends DTKey, E extends object, T extends object = E> {
    info?(): Promise<Wrap<undefined> & DTMetadata>;
    list?(authorize: DTAuthorizer<K, T[]>, filter?: DTFilter): Promise<T[] & DTMetadata>;
    load?(authorize: DTAuthorizer<K, T>, key: K): Promise<T & DTMetadata>;
    save?(authorize: DTAuthorizer<K, T>, key: K, entity: E, precondition?: Precondition): Promise<T & DTMetadata>;
    append?(authorize: DTAuthorizer<K, T>, entity: E, precondition?: Precondition): Promise<T & DTMetadata>;
    modify?(authorize: DTAuthorizer<K, T>, key: K, transform: Partial<E> | ((current: T) => T | Promise<T>), precondition?: Precondition): Promise<T & DTMetadata>;
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

export interface DTRecordMetadata {
    timestamp?:  Date;
    version?:    string | null;
}

export interface DTTableMetadata extends DTRecordMetadata {
    totalCount?: number;
}

export abstract class DataTableBase<K extends DTKey, E extends object, T extends object = E> implements DataTable<K, E, T> {
    protected abstract makeRecord(key: K | null, current: Readonly<T> | null, entity: E | T): T;
    protected abstract recordMetadata(record: Readonly<T>): DTRecordMetadata | Promise<DTRecordMetadata>;
    protected abstract tableMetadata(extended: boolean): DTTableMetadata | Promise<DTTableMetadata>;

    protected abstract dtbTransaction<T>(mode: 'write' | 'read', cb: () => Promise<T>): Promise<T>;
    protected abstract dtbList(filter?: DTFilter): Promise<{ records: T[], totalCount?: number }>;
    protected abstract dtbLoad(key: K, lock?: 'write' | 'read'): Promise<T | null>;
    protected abstract dtbAppend(record: T): Promise<T>;
    protected abstract dtbModify(key: K, record: T): Promise<T>;
    protected abstract dtbRemove(key: K): Promise<void>;

    protected dtbError(err: Error): never {
        throw err;
    }

    subset(...ops: Array<keyof DataTable<K, E, T>>): DataTable<K, E, T> {
        const dt = Object.create(this) as DataTable<K, E, T>;

        for (const op of ['info', 'list', 'load', 'save', 'append', 'modify', 'remove'] as const) {
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
            totalCount: rsrcMetadata.totalCount,
            version:    rsrcMetadata.version,
        } satisfies DTMetadata[typeof DT_METADATA]});
    }

    async list(authorize: DTAuthorizer<K, T[]>, filter?: DTFilter): Promise<T[] & DTMetadata> {
        return await this.dtbTransaction('read', async () => {
            const rsrcMetadata = await this.tableMetadata(false);
            const listResponse = await this.dtbList(filter).catch(err => this.dtbError(err));
            const listMetadata = (list: T[]) => Object.defineProperty(list as T[] & DTMetadata, DT_METADATA, { configurable: true, value: {
                timestamp:  rsrcMetadata.timestamp,
                totalCount: listResponse.totalCount,
                version:    rsrcMetadata.version,
            } satisfies DTMetadata[typeof DT_METADATA] });

            return listMetadata(await authorize(null, listMetadata(listResponse.records)) ?? throwError('No list returned from authorizer.'));
        });
    }

    async load(authorize: DTAuthorizer<K, T>, key: K): Promise<T & DTMetadata> {
        const current = await this._recordMetadata(await this.dtbLoad(key).catch(err => this.dtbError(err)));
        return await this._recordMetadata(await authorize(key, current)) ?? throwError(new DTError('not-found'));
    }

    async save(authorize: DTAuthorizer<K, T>, key: K, entity: E, precondition?: Precondition): Promise<T & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await authorize(key, structuredClone(current), async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                precondition?.assert(version, timestamp);

                return this.makeRecord(key, current, entity);
            }) ?? throwError('No object returned from authorizer.');

            const record = current
                ? await this.dtbModify(key, this._toUpdateRow(current, updated)).catch(err => this.dtbError(err))
                : await this.dtbAppend(updated).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, current === null) ?? throwError('dtbModify/dtbAppend did not return a record.');
        });
    }

    async append(authorize: DTAuthorizer<K, T>, entity: E, precondition?: Precondition): Promise<T & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const created = await authorize(null, null, async () => {
                if (precondition) {
                    const { version, timestamp } = await this.tableMetadata(false);
                    precondition.assert(version, timestamp);
                }

                return this.makeRecord(null, null, entity);
            }) ?? throwError('No object returned from authorizer.');

            const record = await this.dtbAppend(created).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, true) ?? throwError('dtbAppend did not return a record.');
        });
    }

    async modify(authorize: DTAuthorizer<K, T>, key: K, transform: Partial<E> | ((current: T) => T | Promise<T>), precondition?: Precondition): Promise<T & DTMetadata> {
        const transformer = typeof transform === 'function' ? transform : (current: T) => Object.assign(current, transform);

        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await authorize(key, structuredClone(current), async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                precondition?.assert(version, timestamp);

                return this.makeRecord(key, current, await transformer(structuredClone(current ?? throwError(new DTError('not-found')))));
            }) ?? throwError('No object returned from authorizer.');

            const record = await this.dtbModify(key, this._toUpdateRow(current, updated)).catch(err => this.dtbError(err));
            return await this._recordMetadata(record, false) ?? throwError('dtbModify did not return a record.');
        });
    }

    async remove(authorize: DTAuthorizer<K, T>, key: K, precondition?: Precondition): Promise<T & DTMetadata | Wrap<null> & DTMetadata> {
        return await this.dtbTransaction('write', async () => {
            const current = await this._recordMetadata(await this.dtbLoad(key, 'write').catch(err => this.dtbError(err)));
            const updated = await authorize(key, structuredClone(current), async () => {
                const { version, timestamp } = current?.[DT_METADATA] ?? { version: null };
                precondition?.assert(version, timestamp);

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
        });
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
        for (const col in current) {
            if (!(col in entity)) {
                (entity as any)[col] = undefined; // Ensure all known columns are present
            }
        }

        return entity;
    }
}

export interface DBDTFilter extends DTFilter {
    where?: URIString;
}

export abstract class DBDataTable<K extends DTKey, E extends object, T extends object = E> extends DataTableBase<K, E, T> {
    constructor(protected _db: DatabaseURI, protected _table: string | URIString, protected _pk: K) {
        super();
    }

    protected dbRef(scope: 'one' | 'all', filter?: K | DBDTFilter | URIString, lock?: 'write' | 'read'): DatabaseURI {
        let query = uri`#${this._table};${scope}`;

        if (filter instanceof URIString) {
            query = uri`${query}?${filter}`;
        } else if (typeof filter === 'string' || typeof filter === 'number' || typeof filter === 'bigint') {
            query = uri`${query}?{eq,${this._pk},${filter}}`;
        } else if (filter) {
            if (filter.where?.length) {
                query = uri`${query}?${filter.where}`;
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

    protected dbRecordToRow(record: T): object {
        return record;
    }

    protected dbRowToRecord(row: object): T {
        return row as T;
    }

    protected dbInsertedKey(record: T, dbResult: DBResult): K {
        return (record[this._pk as unknown as keyof T] ?? dbResult.rowKey) as K ?? throwError('Unable to get key of inserted record.');
    }

    protected override async dtbTransaction<T>(mode: 'write' | 'read', cb: () => Promise<T>): Promise<T> {
        return this._db.query<T>((_retries) => cb());
    }

    protected override async dtbList(filter?: DBDTFilter): Promise<{ records: T[]; totalCount?: number }> {
        return await this.dbRef('all', filter).load<object[]>().then(records => ({
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
