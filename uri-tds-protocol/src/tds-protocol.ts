import { WWWAuthenticate } from '@divine/headers';
import { BasicAuthScheme, DatabaseURI, DBDriver, URI } from '@divine/uri';
import { TDSConnectionPool } from './private/tds-impl';

export class TDSURI extends DatabaseURI {
    protected async _createDBConnectionPool(): Promise<DBDriver.DBConnectionPool> {
        const method = this.protocol.slice(0, -1);

        return new TDSConnectionPool(this, async () => {
            const hdrs = Object.entries(this._getBestSelector(this.selectors.header)?.headers ?? {});
            const auth = await this._getAuthorization({ method, url: this, headers: hdrs }, undefined, WWWAuthenticate.create('basic'));

            return auth?.scheme === 'basic' ? BasicAuthScheme.decodeCredentials(auth.credentials) : undefined;
        });
    }
}

URI
    .register('sqlserver:', TDSURI)
    .register('tds:',       TDSURI)
;
