import { DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { MyConnectionPool } from './mysql-impl';

export { MariaDBStatus, MySQLStatus } from './mysql-errors';

export class MySQLURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new MyConnectionPool(this, params);
    }
}

URI
    .register('mysql:',   MySQLURI)
    .register('mariadb:', MySQLURI)
;
