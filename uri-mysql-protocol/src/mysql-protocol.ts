import { ContentType, WWWAuthenticate } from '@divine/headers';
import { BasicAuthScheme, DatabaseURI, DBDriver, DBMetadata, URI } from '@divine/uri';
import { MyConnectionPool } from './private/mysql-impl';

export class MySQLURI extends DatabaseURI {
    protected async _createDBConnectionPool(): Promise<DBDriver.DBConnectionPool> {
        const method = this.protocol.slice(0, -1);

        return new MyConnectionPool(this, async () => {
            const hdrs = Object.entries(this._getBestSelector(this.selectors.header)?.headers ?? {});
            const auth = await this._getAuthorization({ method, url: this, headers: hdrs }, undefined, WWWAuthenticate.create('basic'));

            return auth?.scheme === 'basic' ? BasicAuthScheme.decodeCredentials(auth.credentials) : undefined;
        });
    }
}

URI
    .register('mysql:',   MySQLURI)
    .register('mariadb:', MySQLURI)
;
