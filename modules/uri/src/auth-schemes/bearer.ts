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
        const credentials = await this._retrieveCredentials({ authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this._scheme} ${credentials.identity}`, proxyHeader) : undefined;
    }

    override async verifyAuthorization(authorization: Authorization | undefined, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<string> {
        const identity = this._assertCompatibleAuthHeader(authorization)?.credentials;

        if (!identity) {
            throw new AuthSchemeError(`No credentials provided.`, await this._createChallenge(authorization));
        }

        const trusted = await this._verifyCredentials({ authScheme: this, identity, authorization, request });

        if (trusted === true) {
            return identity;
        } else if (!trusted || !AuthScheme.safeCompare(identity, trusted.identity)) {
            throw new AuthSchemeError(`Token not valid.`, (await this._createChallenge(authorization)).setParam('error', 'invalid_token'));
        } else {
            return trusted.identity;
        }
    }

    override verifyAuthenticationInfo = undefined;

    protected override _isCompatibleCredentials(credentials: Credentials): boolean {
        return typeof credentials.identity === 'string';
    }
}

AuthScheme.register('bearer', BearerAuthScheme);
