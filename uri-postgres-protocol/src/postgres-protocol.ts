import { WWWAuthenticate } from '@divine/headers';
import { BasicAuthScheme, DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { PGConnectionPool } from './postgres-impl';

export { PostgresSQLState } from './postgres-errors';

export class PostgresURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector['params']): Promise<DBDriver.DBConnectionPool> {
        return new PGConnectionPool(this, params, async () => {
            const hdrs = Object.entries(this._getBestSelector(this.selectors.headers)?.headers ?? {});
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
