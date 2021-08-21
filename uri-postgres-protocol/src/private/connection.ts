import { BasicCredentials, DatabaseURI, DBColumnInfo, DBDriver, DBError, DBMetadata, DBQuery, DBResult, DBTransactionParams, q, URI } from '@divine/uri';
import { Client, ClientConfig, FieldDef, QueryArrayResult, types } from 'pg';
import { URL } from 'url';

const parseBigIntArray = types.getTypeParser(1016);
const noColumnInfo = Object.freeze({});

type PropTypeMap<Obj, PropType> = {
    [K in { [P in keyof Obj]: Required<Obj>[P] extends PropType ? P : never }[keyof Obj] ]: true
} & {
    [K in { [P in keyof Obj]: Required<Obj>[P] extends PropType ? never : P }[keyof Obj] ]?: never
}

const numericColInfoProps: PropTypeMap<DBColumnInfo, number> = {
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

const booleanColInfoProps: PropTypeMap<DBColumnInfo, boolean> = {
    identity_cycle:      true,
    is_generated:        true,
    is_hidden:           true,
    is_identity:         true,
    is_nullable:         true,
    is_self_referencing: true,
    is_updatable:        true,
}

export class PGConnectionPool extends DBDriver.DBConnectionPool {
    constructor(dbURI: DatabaseURI, private getCredentials: () => Promise<BasicCredentials | undefined>) {
        super(dbURI);
    }

    protected async createDBConnection(): Promise<PGDatabaseConnection> {
        const creds = await this.getCredentials();
        const dbURL = new URL(this.dbURI.href);

        dbURL.username = creds?.identity ?? '';
        dbURL.password = creds?.secret ?? '';

        return new PGDatabaseConnection(this.dbURI, {
            connectionString: dbURL.href,
            types: {
                getTypeParser: (id, format) =>
                    id === 20   ? BigInt : // ts-ignore-error: id 1016 is unknown
                    id === 1016 ? (value: string) => parseBigIntArray(value).map(BigInt) :
                    types.getTypeParser(id, format)
            }
        });
    }
}

class PGDatabaseConnection implements DBDriver.DBConnection {
    private client: Client;
    private version?: string;
    private crdb = false;
    private tlevel = 0;
    private savepoint = 0;
    private columnInfoCache: { [key: string]: Omit<DBColumnInfo, 'label'> | undefined } = {};

    constructor(private dbURI: DatabaseURI, config: ClientConfig) {
        this.client = new Client(config);
    }

    async open() {
        await this.client.connect();

        this.version = (await this.query<{ version: string }>(q`select version()`))[0]?.version;
        this.crdb = /^CockroachDB/i.test(this.version);
    }

    async close() {
        await this.client.end();
    }

    async query<T>(query: DBQuery): Promise<T[] & DBMetadata> {
        const text = query.toString((index) => `$${index + 1}`);

        if (query.batches.length > 1) {
            throw new Error(`Batch queries not supported`);
        }

        try {
            const rs = await this.client.query({ rowMode: 'array', text, values: query.batches[0] as any[] });
            const dr = new PGResult(this.dbURI, rs);

            return dr.toObjects([ dr ]);
        }
        catch (err) {
            throw typeof err.code === 'string' ? new DBError(err.code, 'Query failed', err, query) : err;
        }
    }

    async transaction<T>(dtp: DBTransactionParams, cb: () => Promise<T> | T): Promise<T> {
        const level = this.tlevel++;

        try {
            if (level === 0) {
                const retries = dtp.retries ?? 8;
                const backoff = dtp.backoff ?? ((count) => (2 ** count - Math.random()) * 100);

                for (let retry = 0; /* Keep going */; ++retry) {
                    if (!this.crdb || retry === 0) {
                        await this.query(dtp.begin ?? q`begin`);
                    }

                    if (this.crdb && retry === 0) {
                        await this.query(q`savepoint cockroach_restart`);
                    }

                    try {
                        const result = await cb();
                        await this.query(q`commit`);
                        return result;
                    }
                    catch (err) {
                        if (err instanceof DBError && err.status === '40001' /* SERIALIZATION_FAILURE */ && retry < retries) {
                            if (this.crdb) {
                                await this.query(q`rollback to savepoint cockroach_restart`);
                            }
                            else {
                                await this.query(q`rollback`);
                            }

                            // Sleep a bit, then retry
                            await new Promise((resolve) => setTimeout(resolve, backoff(retry)));
                        }
                        else {
                            await this.query(q`rollback`);
                            throw err;
                        }
                    }
                }
            }
            else {
                const savepoint = `_${level}_${this.savepoint++}`;

                await this.query(q.raw(`savepoint ${savepoint}`));

                try {
                    const result = await cb();
                    await this.query(q.raw(`release savepoint ${savepoint}`));
                    return result;
                }
                catch (err) {
                    await this.query(q.raw(`rollback to savepoint ${savepoint}`));
                    throw err;
                }
            }
        }
        finally {
            this.tlevel--;
        }
    }

    private async getColumnInfo(fields: FieldDef[], withColumnInfo: boolean): Promise<DBColumnInfo[]> {
        const result = fields.map((field) => {
            // By including the datatype props in the key, the cache will kind of invalidate automatically on schema changes
            const key = `${field.tableID}:${field.columnID}:${field.dataTypeID}:${field.dataTypeSize}:${field.dataTypeModifier}`;
            return { key, field, label: field.name, info: this.columnInfoCache[key] };
        });

        const missingTables = [...new Set(result.filter((r) => withColumnInfo && !r.info &&  (r.field.tableID && r.field.columnID)).map((r) => r.field.tableID))];
        const missingColDTs = [...new Set(result.filter((r) => withColumnInfo && !r.info && !(r.field.tableID && r.field.columnID)).map((r) => r.field.dataTypeID))];

        if (missingTables.length) {
            const colInfo = await this.query<DBColumnInfo>(q`
                select c.*, concat_ws(':', cast(attrelid as text), cast(attnum as text), cast(atttypid as text), cast(attlen as text), cast(atttypmod as text) ) as _key
                from  pg_catalog.pg_attribute    as pga
                inner join pg_catalog.pg_class      pgc on pgc.oid = pga.attrelid
                inner join pg_catalog.pg_namespace  pgn on pgn.oid = pgc.relnamespace
                inner join information_schema.columns c on c.table_schema = pgn.nspname and c.table_name = pgc.relname and c.column_name = pga.attname
                where ${q.join('or', missingTables.map((t) => q`(pga.attrelid = ${t})`))}
            `);

            for (const ci of colInfo) {
                let key: string | undefined = undefined;

                for (const k of (Object.keys(ci) as (keyof DBColumnInfo)[])) {
                    if (k as string === '_key') {
                        key = ci[k] as string;
                        delete ci[k];
                    }
                    else if (ci[k] === null || ci[k] === undefined) {
                        delete ci[k];
                    }
                    else if (numericColInfoProps[k]) {
                        (ci[k] as any) = Number(ci[k]);
                    }
                    else if (booleanColInfoProps[k]) {
                        (ci[k] as any) = (ci[k] === 'YES');
                    }
                }

                if (key) {
                    this.columnInfoCache[key] = ci;
                }
            }
        }

        if (missingColDTs.length) {
            const dtInfo = await this.query<{ _key: string, typname: string }>(q`
                select typname, concat_ws(':', '0', '0', cast(oid as text), cast(typlen as text), cast(typtypmod as text)) as _key
                from pg_catalog.pg_type t
                where ${q.join('or', missingColDTs.map((t) => q`(oid = ${t})`))}
            `);

            for (const dt of dtInfo) {
                this.columnInfoCache[dt._key] = { udt_name: dt.typname };
            }
        }

        return result.map((r) => ({ label: r.label, ...(this.columnInfoCache[r.key] ?? noColumnInfo) }));
    }
}

interface KeyedInformationSchema extends Omit<DBColumnInfo, 'label'> {
    _key?: string;
}

export class PGResult extends DBResult {
    private _db!: DatabaseURI;
    private _rs!: QueryArrayResult<unknown[]>;

    constructor(db: DatabaseURI, rs: QueryArrayResult<unknown[]>) {
        super(rs.fields.map((f) => ({ label: f.name })), rs.rows);

        Object.defineProperty(this, '_db', { enumerable: false, value: db});
        Object.defineProperty(this, '_rs', { enumerable: false, value: rs});
    }

    async updateColumnInfo(): Promise<DBColumnInfo[]> {
        const tables = [...new Set(this._rs.fields.filter((f) => f.tableID !== 0 && f.columnID !== 0).map((f) => f.tableID))];
        const dtypes = [...new Set(this._rs.fields.filter((f) => f.tableID === 0 && f.columnID === 0).map((f) => f.dataTypeID))];
        const nfomap: { [key: string]: KeyedInformationSchema | undefined } = {};

        if (tables.length) {
            const colInfo = await this._db.query<KeyedInformationSchema[]>(q`
                select c.*, concat_ws(':', cast(attrelid as text), cast(attnum as text), cast(atttypid as text), cast(attlen as text), cast(atttypmod as text)) as _key
                from  pg_catalog.pg_attribute    as pga
                inner join pg_catalog.pg_class      pgc on pgc.oid = pga.attrelid
                inner join pg_catalog.pg_namespace  pgn on pgn.oid = pgc.relnamespace
                inner join information_schema.columns c on c.table_schema = pgn.nspname and c.table_name = pgc.relname and c.column_name = pga.attname
                where ${q.join('or', tables.map((t) => q`(pga.attrelid = ${t})`))}
            `);

            for (const ci of colInfo) {
                for (const k of (Object.keys(ci) as (keyof typeof ci)[])) {
                    if (k === '_key') {
                        nfomap[ci._key!] = ci;
                        delete ci._key;
                    }
                    else if (ci[k] === null || ci[k] === undefined) {
                        delete ci[k];
                    }
                    else if (numericColInfoProps[k]) {
                        (ci[k] as any) = Number(ci[k]);
                    }
                    else if (booleanColInfoProps[k]) {
                        (ci[k] as any) = (ci[k] === 'YES');
                    }
                }
            }
        }

        if (dtypes.length) {
            const dtInfo = await this._db.query<{ udt_name: string, _key?: string }[]>(q`
                select typname as udt_name, concat_ws(':', '0', '0', cast(oid as text), cast(typlen as text), cast(typtypmod as text)) as _key
                from pg_catalog.pg_type t
                where ${q.join('or', dtypes.map((t) => q`(oid = ${t})`))}
            `);

            for (const dt of dtInfo) {
                nfomap[dt._key!] = dt;
                delete dt._key;
            }
        }

        this._rs.fields.forEach((f, i) => {
            Object.assign(this.columns[i], nfomap[`${f.tableID}:${f.columnID}:${f.dataTypeID}:${f.dataTypeSize}:${f.dataTypeModifier}`]);
        });

        return this.columns;
    }
}

export class PGReference extends DBDriver.DBReference {
    getSaveQuery(value: unknown): DBQuery {
        const [ _scope, objects ] = this.checkSaveArguments(value);
        const columns = this.columns ?? Object.keys(objects[0]);

        return q`\
insert into ${this.getTable()} as _dst_ ${q.values(objects, this.columns)} \
on conflict (${this.getKeys()}) do update set ${
    q.join(',', columns.map((column) => q`${q.quote(column)} = "excluded".${q.quote(column)}`))
}`;
    }
}
