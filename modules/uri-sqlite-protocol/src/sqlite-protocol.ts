import { DatabaseURI, DBDriver, DBParams, DBParamsSelector, URI } from '@divine/uri';
import { Options } from 'better-sqlite3';
import { SQLiteConnectionPool } from './sqlite-impl';

export { SQLiteStatus } from './sqlite-errors';

/** Connection parameters for {@link SQLiteURI}. */
export interface SQLiteConnectOptions extends Options {
    /**
     * Set to `false` to use `number` instead of `bigint` for integer types. Default is to use `bigint`.
     */
    defaultSafeIntegers?: boolean | undefined;
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
