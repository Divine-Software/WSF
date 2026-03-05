import { DatabaseURI, DBDriver, DBParams, DBParamsSelector, URI } from '@divine/uri';
import { ConnectionOptions } from 'mysql2/promise';
import { MyConnectionPool } from './mysql-impl';

export { MariaDBStatus, MySQLStatus } from './mysql-errors';

/** MySQL-specific DBParams. */
export interface MySQLParams extends DBParams {
    connectOptions?: ConnectionOptions;
}

/** Provides configuration parameters for {@link MySQLURI}. */
export interface MySQLParamsSelector extends DBParamsSelector<MySQLParams> {
}

export class MySQLURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: MySQLParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new MyConnectionPool(this, params);
    }
}

URI
    .register('mysql:',   MySQLURI)
    .register('mariadb:', MySQLURI)
;
