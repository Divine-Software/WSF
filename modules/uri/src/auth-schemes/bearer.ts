import { AuthenticationInfo, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { AuthScheme, AuthSchemeError, AuthSchemeRequest, Credentials } from '../auth-schemes';

/** A helper implementation of {@link Credentials} for Bearer tokens. */
export class BearerCredentials implements Credentials {
    identity: string;

    /**
     * Constructs a new BearerCredentials/Credentials object.
     *
     * @param token  The Bearer token, to be stored in {@link identity}.
     */
    constructor(token: string) {
        this.identity = token;
    }
}

/**
 * The `bearer` AuthScheme provides support for [OAuth 2.0 Bearer Tokens](https://tools.ietf.org/html/rfc6750).
 */
export class BearerAuthScheme extends AuthScheme<Credentials> {
    constructor(scheme = 'Bearer') {
        super(scheme);
    }

    override async createAuthorization(challenge?: WWWAuthenticate | undefined, request?: AuthSchemeRequest | undefined, _payload?: Uint8Array | undefined): Promise<Authorization | undefined> {
        const credentials = await this._getCredentials({ mode: 'retrieve', authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this.scheme} ${credentials.identity}`, proxyHeader) : undefined;
    }

    override async verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
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

    override async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        return authentication;
    }

    protected override _isCompatibleCredentials(credentials: Credentials): boolean {
        return typeof credentials.identity === 'string';
    }
}

AuthScheme.register('bearer', BearerAuthScheme);
