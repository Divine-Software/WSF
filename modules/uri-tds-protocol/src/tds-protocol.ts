import { DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { TDSConnectionPool } from './tds-impl';

export { SQLServerSQLState } from './tds-errors';

export class TDSURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new TDSConnectionPool(this, params);
    }
}

URI
    .register('sqlserver:', TDSURI)
    .register('tds:',       TDSURI)
;
