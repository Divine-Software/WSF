import { b64Decode, b64Encode } from '@divine/commons';
import { AuthenticationInfo, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { AuthScheme, AuthSchemeError, AuthSchemeRequest, PasswordCredentials } from '../auth-schemes';

export class BasicCredentials implements PasswordCredentials {
    identity: string;
    secret:   string;

    constructor(username: string, password: string) {
        this.identity = username;
        this.secret   = password;
    }
}

export class BasicAuthScheme extends AuthScheme<PasswordCredentials> {
    constructor(scheme = 'Basic') {
        super(scheme);
    }

    static encodeCredentials(credentials: PasswordCredentials): string {
        return b64Encode(`${credentials.identity}:${credentials.secret}`);
    }

    static decodeCredentials(credentials?: string): PasswordCredentials | undefined {
        const [, username, password] = /([^:]*):?(.*)/.exec(b64Decode(credentials ?? '')) ?? [undefined, undefined, undefined];

        return username !== undefined && password !== undefined ? { identity: username, secret: password } : undefined;
    }

    async createAuthorization(challenge?: WWWAuthenticate, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<Authorization | undefined> {
        const credentials = await this._getCredentials({ mode: 'retrieve', authScheme: this, challenge, request });
        const proxyHeader = challenge?.isProxyHeader() ?? this.proxy;

        return credentials ? new Authorization(`${this.scheme} ${BasicAuthScheme.encodeCredentials(credentials)}`, proxyHeader) : undefined;
    }

    async verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        const untrusted = BasicAuthScheme.decodeCredentials(this._assertCompatibleAuthHeader(authorization)?.credentials);

        if (!untrusted) {
            throw new AuthSchemeError(`No credentials provided`, await this._createChallenge(authorization));
        }

        const trusted = await this._getCredentials({ mode: 'verify', authScheme: this, identity: untrusted.identity, authorization, request});

        if (!trusted) {
            throw new AuthSchemeError(`User ${untrusted.identity} not found`, await this._createChallenge(authorization));
        }

        if (!AuthScheme.safeCompare(BasicAuthScheme.encodeCredentials(untrusted), BasicAuthScheme.encodeCredentials(trusted))) {
            throw new AuthSchemeError(`Invalid password`, await this._createChallenge(authorization));
        }

        return authorization;
    }

    async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        return authentication;
    }

    protected _isCompatibleCredentials(credentials: PasswordCredentials): boolean {
        return typeof credentials.identity === 'string' && typeof credentials.secret === 'string';
    }
}

AuthScheme.register('basic', BasicAuthScheme);
