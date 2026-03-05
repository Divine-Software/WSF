import { DatabaseURI, DBDriver, DBParams, DBParamsSelector, URI } from '@divine/uri';
import { ClientConfig } from 'pg';
import { PGConnectionPool } from './postgres-impl';

export { PostgresSQLState } from './postgres-errors';

/** Postgres-specific DBParams. */
export interface PostgresParams extends DBParams {
    connectOptions?: ClientConfig;
}

/** Provides configuration parameters for {@link PostgresURI}. */
export interface PostgresParamsSelector extends DBParamsSelector<PostgresParams> {
}

export class PostgresURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: PostgresParamsSelector): Promise<DBDriver.DBConnectionPool> {
        return new PGConnectionPool(this, params);
    }
}

URI
    .register('pg:',         PostgresURI)
    .register('postgres:',   PostgresURI)
    .register('postgresql:', PostgresURI)
;
