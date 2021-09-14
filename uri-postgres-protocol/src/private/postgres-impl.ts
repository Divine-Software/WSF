import { BasicCredentials, DatabaseURI, DBColumnInfo, DBDriver, DBError, DBMetadata, DBQuery, DBResult, DBTransactionParams, q } from '@divine/uri';
import { Client, QueryArrayResult, types } from 'pg';
import { URL } from 'url';

const parseBigIntArray = types.getTypeParser(1016);

export class PGConnectionPool extends DBDriver.DBConnectionPool {
    constructor(dbURI: DatabaseURI, private _getCredentials: () => Promise<BasicCredentials | undefined>) {
        super(dbURI);
    }

    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new PGDatabaseConnection(this.dbURI, await this._getCredentials());
    }
}

class PGDatabaseConnection implements DBDriver.DBConnection {
    private _client?: Client;
    private _version?: string;
    private _crdb = false;
    private _tlevel = 0;
    private _savepoint = 0;

    constructor(private _dbURI: DatabaseURI, private _creds?: BasicCredentials) {
    }

    async open() {
        const dbURL = new URL(this._dbURI.href);

        dbURL.username = this._creds?.identity ?? '';
        dbURL.password = this._creds?.secret ?? '';

        this._client = new Client({
            connectionString: dbURL.href,
            types: {
                getTypeParser: (id, format) =>
                    id === 20   ? BigInt : // ts-ignore-error: id 1016 is unknown
                    id === 1016 ? (value: string) => parseBigIntArray(value).map(BigInt) :
                    types.getTypeParser(id, format)
            }
        });

        await this._client.connect();

        this._version = (await this.query(q`select version()`))[0][0][0] as string;
        this._crdb = /^CockroachDB/i.test(this._version);
    }

    async close() {
        await this._client?.end();
        delete this._client;
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        if (!this._client) {
            throw new ReferenceError('Driver not open');
        }

        const result: DBResult[] = [];

        for (const query of queries) {
            try {
                result.push(new PGResult(this._dbURI, await this._client.query({
                    text:    query.toString((_v, i) => `$${i + 1}`),
                    values:  query.params,
                    rowMode: 'array',
                })));
            }
            catch (err: any) {
                throw typeof err.code === 'string' ? new DBError(err.code, err.code, 'Query failed', err, query) : err;
            }
        }

        return result;
    }

    async transaction<T>(dtp: DBTransactionParams, cb: () => Promise<T> | T): Promise<T> {
        if (!this._client) {
            throw new ReferenceError('Driver not open');
        }

        const level = this._tlevel++;

        try {
            if (level === 0) {
                const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
                const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;

                for (let retry = 0; /* Keep going */; ++retry) {
                    if (!this._crdb || retry === 0) {
                        await this.query(dtp.begin ?? q`begin`);
                    }

                    if (this._crdb && retry === 0) {
                        await this.query(q`savepoint cockroach_restart`);
                    }

                    try {
                        const result = await cb();
                        await this.query(q`commit`);
                        return result;
                    }
                    catch (err) {
                        if (err instanceof DBError && err.state === '40001' /* SERIALIZATION_FAILURE */ && retry < retries) {
                            if (this._crdb) {
                                await this.query(q`rollback to cockroach_restart`).catch(() => { throw err });
                            }
                            else {
                                await this.query(q`rollback`).catch(() => { throw err });
                            }

                            // Sleep a bit, then retry
                            await new Promise((resolve) => setTimeout(resolve, backoff(retry)));
                        }
                        else {
                            await this.query(q`rollback`).catch(() => { throw err });
                            throw err;
                        }
                    }
                }
            }
            else {
                const savepoint = `_${level}_${this._savepoint++}`;

                await this.query(q.raw(`savepoint ${savepoint}`));

                try {
                    const result = await cb();
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
        return new PGReference(dbURI, this._crdb);
    }
}

interface KeyedInformationSchema extends Omit<DBColumnInfo, 'label'> {
    _key?: string;
}

export class PGResult extends DBResult {
    constructor(private _db: DatabaseURI, private _rs: QueryArrayResult<unknown[]>) {
        super(_rs.fields.map((f) => ({ label: f.name })), _rs.rows, _rs.rowCount ?? undefined);

        Object.defineProperty(this, '_db', { enumerable: false });
        Object.defineProperty(this, '_rs', { enumerable: false });
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
                for (const k of Object.keys(ci) as (keyof typeof ci)[]) {
                    if (k === '_key') {
                        nfomap[ci._key!] = ci;
                        delete ci._key;
                    }
                    else if (ci[k] === null || ci[k] === undefined) {
                        delete ci[k];
                    }
                    else if (DBDriver.numericColInfoProps[k]) {
                        (ci[k] as any) = Number(ci[k]);
                    }
                    else if (DBDriver.booleanColInfoProps[k]) {
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
    constructor(dbURI: DatabaseURI, private isCRDB: boolean) {
        super(dbURI);
    }

    getSaveQuery(value: unknown): DBQuery {
        const [ _scope, objects, keys ] = this.checkSaveArguments(value, !this.isCRDB);
        const columns = this.columns ?? Object.keys(objects[0]);

        return keys ? q`\
insert into ${this.getTable()} as _dst_ ${q.values(objects, this.columns)} \
on conflict (${this.getKeys()}) do update set ${
    q.join(',', columns.map((column) => q`${q.quote(column)} = "excluded".${q.quote(column)}`))
} returning *`
            : q`upsert into ${this.getTable()} ${q.values(objects, this.columns)} returning *`;
    }

    getAppendQuery(value: unknown): DBQuery {
        return q`${super.getAppendQuery(value)} returning *`;
    }
}
