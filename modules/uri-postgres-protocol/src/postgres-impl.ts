import { as, AsyncIteratorAdapter } from '@divine/commons';
import { DatabaseURI, DBColumnInfo, DBDriver, DBError, DBQuery, DBResult, DBTransactionParams, PasswordCredentials, q } from '@divine/uri';
import assert from 'assert';
import { Client, ClientConfig, FieldDef, Query, QueryArrayConfig, types } from 'pg';
import { URL } from 'url';
import { PostgresSQLState as SQLState } from './postgres-errors';

const parseBigIntArray = types.getTypeParser(1016);
const deadlocks = [ SQLState.SERIALIZATION_FAILURE, SQLState.DEADLOCK_DETECTED ] as string[];
const listenFields: FieldDef[] = [
    { name: 'channel', tableID: 0, columnID: 0, dataTypeID: types.builtins.TEXT, dataTypeSize: -1, dataTypeModifier: -1, format: 'text' },
    { name: 'process', tableID: 0, columnID: 0, dataTypeID: types.builtins.INT4, dataTypeSize: -1, dataTypeModifier: -1, format: 'int4' },
    { name: 'payload', tableID: 0, columnID: 0, dataTypeID: types.builtins.TEXT, dataTypeSize: -1, dataTypeModifier: -1, format: 'text' },
]

export class PGConnectionPool extends DBDriver.DBConnectionPool {
    protected async _createDBConnection(): Promise<DBDriver.DBConnection> {
        return new PGDatabaseConnection(this._dbURI, this._params.connectOptions, await this._getCredentials());
    }
}

class PGDatabaseConnection implements DBDriver.DBConnection {
    private _client?: Client;
    private _version?: string;
    private _crdb = false;
    private _tlevel = 0;
    private _savepoint = 0;

    constructor(private _dbURI: DatabaseURI, private _options?: object, private _creds?: PasswordCredentials) {
    }

    get state() {
        return this._client ? 'open' : 'closed'
    }

    async open() {
        const dbURL = new URL(this._dbURI.href);

        dbURL.username = this._creds?.identity ?? '';
        dbURL.password = this._creds?.secret ?? '';

        this._client = new Client({
            connectionString: dbURL.href,
            types: {
                // @ts-expect-error: Target signature provides too few arguments. Expected 2 or more, but got 1.ts(2322)
                getTypeParser: (id, format) =>
                    id === 20   ? BigInt :
                    id === 1016 ? (value: string) => (parseBigIntArray(value) as any).map(BigInt) :
                    types.getTypeParser(id, format as 'text' & 'binary'),
            },
            ...this._options as ClientConfig
        });

        await this._client.connect();

        this._version = (await this.query(q`select version()`))[0][0][0] as string;
        this._crdb = /^CockroachDB/i.test(this._version);
    }

    async close() {
        await this._client?.end();
        delete this._client;
    }

    async ping(_timeout: number) {
        await this.query(q`select null`);
    }

    async query(...queries: DBQuery[]): Promise<DBResult[]> {
        assert(this._client, 'DBConnection closed');

        const result: DBResult[] = [];

        for (const query of queries) {
            try {
                const rs = await this._client.query({
                    text:    query.toString((_v, i) => `$${i + 1}`),
                    values:  query.params,
                    rowMode: 'array',
                });

                result.push(new PGResult(this._dbURI, rs.fields, rs.rows, rs.rowCount ?? undefined));
            }
            catch (err: any) {
                throw typeof err.code === 'string' ? new DBError('', err.code, 'Query failed', err, query) : err;
            }
        }

        return result;
    }

    async* watch(query: DBQuery) {
        assert(this._client, 'DBConnection closed');

        // Listen for NOTIFY notifications and stream the result set (if any)
        const result = new AsyncIteratorAdapter<DBResult>();

        this._client.on('notification', (message) => {
            result.next(new PGResult(this._dbURI, listenFields, [[ message.channel, message.processId, message.payload ]], 1))
        });

        this._client.query(new Query(as<QueryArrayConfig>({
            text:    query.toString((_v, i) => `$${i + 1}`),
            values:  query.params,
            rowMode: 'array',
        })).on('row', (row, rs) => {
            rs && result.next(new PGResult(this._dbURI, rs.fields, [ row ]))
        }).on('error', (err) => {
            result.throw(err)
        }));

        try {
            yield* result;
        }
        catch (err: any) {
            throw typeof err.code === 'string' ? new DBError('', err.code, 'Watch failed', err, query) : err;
        }
        finally {
            await this.close(); // Never reuse a connection that has been watched
        }
    }

    async transaction<T>(dtp: DBTransactionParams, cb: DBDriver.DBCallback<T>): Promise<T> {
        assert(this._client, 'DBConnection closed');

        const level = this._tlevel++;

        try {
            if (level === 0) {
                const retries = dtp.retries ?? DBDriver.DBConnectionPool.defaultRetries;
                const backoff = dtp.backoff ?? DBDriver.DBConnectionPool.defaultBackoff;

                for (let retry = 0; /* Keep going */; ++retry) {
                    if (!this._crdb || retry === 0) {
                        await this.query(q`begin ${dtp.options ?? q``}`);
                    }

                    if (this._crdb && retry === 0) {
                        await this.query(q`savepoint cockroach_restart`);
                    }

                    try {
                        const result = await cb(retry);
                        await this.query(q`commit`);
                        return result;
                    }
                    catch (err) {
                        if (err instanceof DBError && deadlocks.includes(err.state) && retry < retries) {
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
        return new PGReference(dbURI, this._crdb);
    }
}

interface KeyedInformationSchema extends Omit<DBColumnInfo, 'label'> {
    _key?: string;
}

export class PGResult extends DBResult {
    constructor(db: DatabaseURI, private _fd: FieldDef[], rows: unknown[][], rowCount?: number) {
        super(db, _fd.map((f) => ({
                label:   f.name,
                type_id: f.dataTypeID,
            })), rows, rowCount);

        Object.defineProperty(this, '_fd', { enumerable: false });
    }

    override async updateColumnInfo(): Promise<DBColumnInfo[]> {
        const tables = [...new Set(this._fd.filter((f) => f.tableID !== 0 && f.columnID !== 0).map((f) => f.tableID))];
        const dtypes = [...new Set(this._fd.filter((f) => f.tableID === 0 && f.columnID === 0).map((f) => f.dataTypeID))];
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

            for (const _ci of colInfo) {
                const ci: KeyedInformationSchema = this._fixColumnInfo(_ci);

                nfomap[ci._key!] = ci;
                delete ci._key;
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

        this._fd.forEach((f, i) => {
            Object.assign(this.columns[i], nfomap[`${f.tableID}:${f.columnID}:${f.dataTypeID}:${f.dataTypeSize}:${f.dataTypeModifier}`]);
        });

        return this.columns;
    }
}

export class PGReference extends DBDriver.DBReference {
    constructor(dbURI: DatabaseURI, private _isCRDB: boolean) {
        super(dbURI);
    }

    override getSaveQuery(value: unknown): DBQuery {
        const [ _scope, columns, objects, keys ] = this._checkSaveArguments(value, !this._isCRDB);
        const updColumns = columns.filter((c) => !keys?.includes(c));

        return keys ? q`\
insert into ${this._getTable()} as _dst_ ${q.values(objects, columns)} \
on conflict (${this._getKeys()}) do update set ${
    q.join(',', updColumns.map((column) => q`${q.quote(column)} = "excluded".${q.quote(column)}`))
} returning *`
            : q`upsert into ${this._getTable()} ${q.values(objects, columns)} returning *`;
    }

    override getAppendQuery(value: unknown): DBQuery {
        return q`${super.getAppendQuery(value)} returning *`;
    }
}
