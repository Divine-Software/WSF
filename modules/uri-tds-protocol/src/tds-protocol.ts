import { DatabaseURI, DBDriver, DBParams, DBParamsSelector, URI } from '@divine/uri';
import { ConnectionOptions } from 'tedious';
import { TDSConnectionPool } from './tds-impl';

export { SQLServerSQLState } from './tds-errors';

/** TDS-specific DBParams. */
export interface TDSParams extends DBParams {
    connectOptions?: ConnectionOptions;
}

/** Provides configuration parameters for {@link TDSURI}. */
export interface TDSParamsSelector extends DBParamsSelector<TDSParams> {
}

export class TDSURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: TDSParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new TDSConnectionPool(this, params);
    }
}

URI
    .register('sqlserver:', TDSURI)
    .register('tds:',       TDSURI)
;
