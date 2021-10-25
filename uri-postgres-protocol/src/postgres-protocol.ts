import { DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { PGConnectionPool } from './postgres-impl';

export { PostgresSQLState } from './postgres-errors';

export class PostgresURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new PGConnectionPool(this, params);
    }
}

URI
    .register('pg:',         PostgresURI)
    .register('postgres:',   PostgresURI)
    .register('postgresql:', PostgresURI)
;
