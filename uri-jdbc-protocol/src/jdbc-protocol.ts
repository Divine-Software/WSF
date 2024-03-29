import { DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { JDBCConnectionPool } from './jdbc-impl';

export { H2SQLState, H2Status } from './jdbc-errors';

export class JDBCURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new JDBCConnectionPool(this, params);
    }
}

URI.register('jdbc:', JDBCURI);
