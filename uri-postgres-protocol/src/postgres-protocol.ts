import { WWWAuthenticate } from '@divine/headers';
import { BasicAuthScheme, DatabaseURI, DBDriver, URI } from '@divine/uri';
import { PGConnectionPool } from './private/postgres-impl';

export { PostgresSQLState } from './postgres-errors';

export class PostgresURI extends DatabaseURI {
    protected async _createDBConnectionPool(): Promise<DBDriver.DBConnectionPool> {
        return new PGConnectionPool(this, async () => {
            const hdrs = Object.entries(this._getBestSelector(this.selectors.header)?.headers ?? {});
            const auth = await this._getAuthorization({ method: 'postgres', url: this, headers: hdrs }, undefined, WWWAuthenticate.create('basic'));

            return auth?.scheme === 'basic' ? BasicAuthScheme.decodeCredentials(auth.credentials) : undefined;
        });
    }
}

URI
    .register('pg:',         PostgresURI)
    .register('postgres:',   PostgresURI)
    .register('postgresql:', PostgresURI)
;
