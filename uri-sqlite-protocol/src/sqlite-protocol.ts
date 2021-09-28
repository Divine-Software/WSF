import { DatabaseURI, DBDriver, URI } from '@divine/uri';
import { SQLiteConnectionPool } from './private/sqlite-impl';

export { SQLiteStatus } from './sqlite-errors';

export class SQLiteURI extends DatabaseURI {
    constructor(uri: URI) {
        super(uri);

        // Make pathname absolute, just lite the file: protocol
        const file = new URI(this.href.replace(/[^:]*:([^?#]*).*/, 'file:$1'));
        (this as any).href = `${this.protocol}//${file.host}${file.pathname}${this.search}${this.hash}`
    }

    protected async _createDBConnectionPool(): Promise<DBDriver.DBConnectionPool> {
        return new SQLiteConnectionPool(this);
    }
}

URI.register('sqlite:', SQLiteURI);
