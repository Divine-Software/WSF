import { WWWAuthenticate } from '@divine/headers';
import { BasicAuthScheme, DatabaseURI, DBDriver, DBParamsSelector, URI } from '@divine/uri';
import { MyConnectionPool } from './mysql-impl';

export { MariaDBStatus, MySQLStatus } from './mysql-errors';

export class MySQLURI extends DatabaseURI {
    protected async _createDBConnectionPool(params: DBParamsSelector['params']): Promise<DBDriver.DBConnectionPool> {
        const method = this.protocol.slice(0, -1);

        return new MyConnectionPool(this, params, async () => {
            const hdrs = Object.entries(this._getBestSelector(this.selectors.headers)?.headers ?? {});
            const auth = await this._getAuthorization({ method, url: this, headers: hdrs }, undefined, WWWAuthenticate.create('basic'));

            return auth?.scheme === 'basic' ? BasicAuthScheme.decodeCredentials(auth.credentials) : undefined;
        });
    }
}

URI
    .register('mysql:',   MySQLURI)
    .register('mariadb:', MySQLURI)
;
