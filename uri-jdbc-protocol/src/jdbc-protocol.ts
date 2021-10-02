import { DatabaseURI, DBDriver, URI } from '@divine/uri';
import { JDBCConnectionPool } from './private/jdbc-impl';

export { H2SQLState, H2Status } from './jdbc-errors';

export class JDBCURI extends DatabaseURI {
    protected async _createDBConnectionPool(): Promise<DBDriver.DBConnectionPool> {
        return new JDBCConnectionPool(this);
    }
}

URI.register('jdbc:', JDBCURI);
