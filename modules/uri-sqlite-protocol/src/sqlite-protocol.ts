import { DatabaseURI, DBDriver, DBParams, DBParamsSelector, URI } from '@divine/uri';
import { AggregateOptions, DatabaseSyncOptions, FunctionOptions, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { SQLiteConnectionPool } from './sqlite-impl';

export { SQLiteStatus } from './sqlite-errors';

type NodeSQLiteConnectOptions = Omit<DatabaseSyncOptions,
    | 'allowBareNamedParameters'
    | 'allowExtension'
    | 'allowUnknownNamedParameters'
    | 'open'
    | 'readBigInts'
    | 'returnArrays'
    | 'timeout'
>;

/** Connection parameters for {@link SQLiteURI}. */
export interface SQLiteConnectOptions extends NodeSQLiteConnectOptions {
    /** Shared library extensions to load. */
    extensions?: string[] | undefined;

    /** SQLite aggregate functions to register. */
    aggregates?: Record<string, AggregateOptions> | undefined;

    /** SQLite user-defined functions to register. */
    functions?: Record<string, { options?: FunctionOptions, func: (...args: SQLOutputValue[]) => SQLInputValue  }> | undefined;

    /**
     * Set to `false` to use `number` instead of `bigint` for integer types. Default is to use `bigint`.
     */
    readBigInts?: boolean | undefined;

    /** The busy timeout in milliseconds. Default is 5000 ms. */
    timeout?: number | undefined;
}

/** SQLite-specific DBParams. */
export interface SQLiteParams extends DBParams {
    connectOptions?: SQLiteConnectOptions;
}

/** Provides configuration parameters for {@link SQLiteURI}. */
export interface SQLiteParamsSelector extends DBParamsSelector<SQLiteParams> {
}

export class SQLiteURI extends DatabaseURI {
    constructor(uri: URI) {
        super(uri);

        // Make pathname absolute, just lite the file: protocol
        const file = new URI(this.href.replace(/[^:]*:([^?#]*).*/, 'file:$1'));
        this._href = `${this.protocol}//${file.host}${file.pathname}${this.search}${this.hash}`;
    }

    protected async _createDBConnectionPool(params: SQLiteParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new SQLiteConnectionPool(this, params);
    }
}

URI.register('sqlite:', SQLiteURI);
