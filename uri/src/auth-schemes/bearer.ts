import { AuthenticationInfo, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { AuthScheme, AuthSchemeError, AuthSchemeRequest, Credentials } from '../auth-schemes';

export class BearerCredentials implements Credentials {
    identity: string;

    constructor(token: string) {
        this.identity = token;
    }
}

export class BearerAuthScheme extends AuthScheme<Credentials> {
    constructor(scheme = 'Bearer') {
        super(scheme);
    }

    async createAuthorization(challenge?: WWWAuthenticate | undefined, request?: AuthSchemeRequest | undefined, _payload?: Uint8Array | undefined): Promise<Authorization | undefined> {
        const credentials = await this._getCredentials({ mode: 'retrieve', authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this.scheme} ${credentials.identity}`, proxyHeader) : undefined;
    }

    async verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        const identity = this._assertCompatibleAuthHeader(authorization)?.credentials;

        if (!identity) {
            throw new AuthSchemeError(`No credentials provided`, await this._createChallenge(authorization));
        }

        const trusted = await this._getCredentials({ mode: 'verify', authScheme: this, identity, authorization, request});

        if (!trusted || !AuthScheme.safeCompare(identity, trusted.identity)) {
            throw new AuthSchemeError(`Token not valid`, (await this._createChallenge(authorization)).setParam('error', 'invalid_token'));
        }

        return authorization;
    }

    async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        return authentication;
    }

    protected _isCompatibleCredentials(credentials: Credentials): boolean {
        return typeof credentials.identity === 'string';
    }
}

AuthScheme.register('bearer', BearerAuthScheme);
