import type { Constructor } from '@divine/commons';
import { AuthenticationInfo, AuthHeader, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { URL } from 'url';
import { IOError, Metadata } from './uri';

/** The base credentials interface. */
export interface Credentials {
    /** The identity of the entity to be authorizied, like a user name of identity token. */
    identity: string;
}

/** Username/password credentials. */
export interface PasswordCredentials extends Credentials {
    /** The password. */
    secret: string;
}

/** Information about the request that needs to be authenticated. */
export interface AuthSchemeRequest {
    /** For HTTP request, the request method. Other protocols defines their own meaning of this field. */
    method:  string;

    /** The URL that the authentication applies to. */
    url:     URL;

    /** Extra information available to aid the authentication. For HTTP, this is the request headers. */
    headers: Iterable<[string, string | undefined]>;
}

/** An IOError subclass thrown by the {@link AuthScheme} class. */
export class AuthSchemeError extends IOError {
    /**
     * Constructs a new AuthSchemeError exception.
     *
     * @param message    The error message.
     * @param challenge  An optional challenge in case the client should retry the operation.
     * @param cause      If this error was caused by another exception, pass it here to link it.
     * @param data       Custom, per-exception information associated with the exception.
     */
    constructor(message: string, public challenge?: WWWAuthenticate, cause?: Error, data?: object & Metadata) {
        super(message, cause, data);
    }
}

/**
 * Parameters for a {@link CredentialsProvider}.
 *
 * @template C  The type of credentials that is to be provied.
 */
export interface CredentialsProviderOptions<C extends Credentials> {
    /** If credentials should be provided (`retrieve`) or checked for validity (`verify`). */
    mode:           'retrieve' | 'verify';

    /** The AuthScheme that needs the credentials. */
    authScheme:     AuthScheme<C>;

    /** If mode is `verify`, the identity of the credentials that should be verified. */
    identity?:      string;

    /** If mode is `verify`, the untrusted authorization header that was provided. */
    authorization?: Authorization;

    /** If mode is `retrieve`, the challenge the credential provider should respond to. */
    challenge?:     WWWAuthenticate;

    /** The request that should be authenticated. */
    request?:       AuthSchemeRequest;
}

/**
 * A function used to provide or validate credentials for a request.
 *
 * @template C        The type of credentials that is to be provied.
 * @params   options  Information about the request how the provider should operate.
 *
 */
export type CredentialsProvider<C extends Credentials> = (options: CredentialsProviderOptions<C>) => Promise<C | undefined>;

/**
 * The base class for all authentication scheme subclasses. The subclasses can be constructed manually, but usually
 * aren't. Instead, this class provides the static methods {@link AuthScheme.create} to create a authentication scheme from
 * an authentication header or by the registered authentication name.
 *
 * Below is a list of all known authentication schemes:
 *
 * Authentication name | AuthScheme class
 * --------------------|---------------------
 * `Basic`             | {@link BasicAuthScheme}
 * `Bearer`            | {@link BearerAuthScheme}
 *
 * @template C  The type of credentials this authentication scheme uses.
 */
export abstract class AuthScheme<C extends Credentials> {
    /**
     * Registers a new authentication scheme. All subclasses must register their authentication type support with this
     * method.
     *
     * @template C           The type of credentials this authentication scheme uses.
     * @param    scheme      The name of the authentication scheme to be registered.
     * @param    authScheme  The AuthScheme subclass to register.
     * @returns              The AuthScheme base class (for method chaining).
     */
    static register<C extends Credentials>(scheme: string, authScheme: Constructor<AuthScheme<C>>): typeof AuthScheme {
        AuthScheme._authSchemes.set(scheme, authScheme as unknown as typeof UnknownAuthScheme);
        return AuthScheme;
    }

    /**
     * Creates an authentication scheme class from an authentication header or authentication name.
     *
     * If the authentication scheme is unknown, an instance of {@link UnknownAuthScheme} will be returned.
     *
     * @param from   The type of authentication scheme to create.
     * @param proxy  Set to `true` to force proxy mode. Defaults to {@link AuthHeader.isProxyHeader} or `false`.
     * @returns      An AuthScheme instance that provides authentication for the requested scheme.
     */
    static create(from: AuthHeader | string | RegExp, proxy?: boolean): AuthScheme<Credentials> {
        if (from instanceof AuthHeader) {
            return new (AuthScheme._authSchemes.get(from.scheme.toLowerCase()) ?? UnknownAuthScheme)(from.scheme).setProxyMode(proxy ?? from.isProxyHeader());
        }
        else if (typeof from === 'string') {
            return new (AuthScheme._authSchemes.get(from.toLowerCase()) ?? UnknownAuthScheme)(from).setProxyMode(proxy ?? false);
        }
        else {
            for (const [scheme, ctor] of AuthScheme._authSchemes.entries()) {
                if (from.test(scheme)) {
                    return new ctor().setProxyMode(proxy ?? false);
                }
            }

            return new UnknownAuthScheme();
        }
    }

    private static _authSchemes = new Map<string, typeof UnknownAuthScheme>();

    /** The realm or domain this instance is handling. */
    public realm?: string;

    /** Specifies wheter or not this scheme provides proxy auhentication. Usually false. */
    public proxy: boolean;
    private _credentialsProvider?: CredentialsProvider<C>;

    /**
     * Constructs a new AuthScheme instance.
     *
     * @param scheme  The canonical name of the scheme this instance handles.
     */
    protected constructor(public scheme: string) {
        this.proxy = false;
    }

    /**
     * Sets the proxy mode.
     *
     * @param proxy  `true` if proxy mode, else `false`.
     * @returns      This AuthScheme.
     */
    setProxyMode(proxy: boolean): this {
        this.proxy = proxy;
        return this;
    }

    /**
     * Sets the realm/domain.
     *
     * @param realm  The realm this instance handles.
     * @returns      This AuthScheme.
     */
     setRealm(realm: string): this {
        this.realm = realm;
        return this;
    }

    /**
     * Attaches a CredentialsProvider for retrieving or verifying credentials.
     *
     * @param cp  The CredentialsProvider to register.
     * @returns   This AuthScheme.
     */
    setCredentialsProvider(cp?: CredentialsProvider<C> | C): this {
        this._credentialsProvider = typeof cp === 'function' ? cp : () => Promise.resolve(cp);
        return this;
    }

    /**
     * Generates an {@link Authorization} header for an outgoing request.
     *
     * @param  challenge        An optional challenge sent by the remote server.
     * @param  request          The request that is to be authenticated.
     * @param  payload          The request payload that will be sent.
     * @throws AuthSchemeError  If the challenge or the credentials provided via {@link setCredentialsProvider} are
     *                          incompatibe with this AuthScheme.
     * @returns                 An Authorization header with the provided credentials.
     */
    abstract createAuthorization(challenge?: WWWAuthenticate, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<Authorization | undefined>;

    /**
     * Verifies an {@link Authorization} header from an incoming request.
     *
     * @template T                The type of the header to validate.
     * @param    authorization    The authentication provided by the remote client.
     * @param    request          The request that is to be authenticated.
     * @param    payload          The request payload that was sent.
     * @throws   AuthSchemeError  If the authentication or the credentials provided via {@link setCredentialsProvider}
     *                            are incompatibe with this AuthScheme.
     * @returns                   The validated Authorization header.
     */
    abstract verifyAuthorization<T extends Authorization | undefined>(authorization: T, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<T>;

    /**
     * Verifies an {@link AuthenticationInfo} or {@link ServerAuthorization} header received from a server response.
     *
     * Not all protocols supports verification of responses. In that case, this method does nothing.
     *
     * @template T                The type of the header to validate.
     * @param    authentication   The authentication provided by the remote server.
     * @param    request          The *response* to a request that is to be authenticated.
     * @param    payload          The *response* payload received from the remote server.
     * @throws   AuthSchemeError  If the authentication or the credentials provided via {@link setCredentialsProvider}
     *                            are incompatibe with this AuthScheme.
     * @returns                   The validated AuthenticationInfo/ServerAuthorization header.
     */
    abstract verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(authentication: T, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<T>;

    /**
     * Checks if the provided credentials are compatible with this AuthScheme.
     *
     * @param  credentials      The credentials to check for compatibility.
     * @throws AuthSchemeError  If the credentials provided are incompatibe with this AuthScheme.
     * @returns                 `true` if the provided credentials are usable by this AuthScheme.
     */
    protected abstract _isCompatibleCredentials(credentials: Credentials): boolean;

    /**
     * Creates a new challenge for the client.
     *
     * @param authorization  The authentication the client provided.
     * @returns              A new challenge.
     */
    protected async _createChallenge(authorization?: Authorization): Promise<WWWAuthenticate> {
        const proxyHeader = authorization?.isProxyHeader() ?? this.proxy;

        return new WWWAuthenticate(this.scheme, proxyHeader).setParam('realm', this.realm);
    }

    /**
     * Asks the credentials provider for credentials.
     *
     * @param  options          Options to pass to the credentials provider.
     * @throws AuthSchemeError  If the authentication, challenge or the credentials provided via
     *                          {@link setCredentialsProvider} are incompatibe with this AuthScheme.
     * @returns                 Valid credentials or `undefined` if no credentials could be provided.
     */
    protected async _getCredentials(options: CredentialsProviderOptions<C>): Promise<C | undefined> {
        this._assertCompatibleAuthHeader(options.authorization);
        this._assertCompatibleAuthHeader(options.challenge);

        return this._assertCompatibleCredentials(await this._credentialsProvider?.(options));
    }

    /**
     * Utility method to compare two secrets in a time-constant manner.
     *
     * @param untrusted  The untrusted secret that should be verified.
     * @param trusted    The trusted secret that the untrusted secret should be compared against.
     * @returns          `true` if the secrets are equal, else `false`.
     */
    static safeCompare(untrusted: string | number[], trusted: string | number[]): boolean {
        let sum = 0;

        if (typeof untrusted === 'string' && typeof trusted === 'string') {
            for (let i = 0; i < untrusted.length; ++i) {
                sum += untrusted.charCodeAt(i) ^ trusted.charCodeAt(i);
            }
        }
        else if (Array.isArray(untrusted) && Array.isArray(trusted)) {
            for (let i = 0; i < untrusted.length; ++i) {
                sum += untrusted[i] ^ trusted[i];
            }
        }
        else {
            throw TypeError(`safeCompare arguments should be string or number[]`);
        }

        return sum === 0 && untrusted.length === trusted.length;
    }

    /**
     * Asserts that an authentication header is compatible with this AuthScheme.
     *
     * @param   header           The header to check, or `undefined` to do nothing.
     * @throws  AuthSchemeError  If the header is incompatible with this AuthScheme.
     * @returns                  The provided header.
     */
    protected _assertCompatibleAuthHeader<H extends AuthHeader | undefined>(header: H): H {
        if (header !== undefined && header.scheme !== this.scheme) {
            throw new AuthSchemeError(`Expected auth-scheme '${this.scheme}' in header, not '${header.scheme}'`);
        }
        else {
            return header;
        }
    }

    /**
     * Asserts that some credentials are compatible with this AuthScheme.
     *
     * @template C                The type of credentials that the scheme uses.
     * @param    credentials      The credentials to check, or `undefined` to do nothing.
     * @throws   AuthSchemeError  If the credentials are incompatible with this AuthScheme.
     * @returns                   The provided credentials.
     */
     protected _assertCompatibleCredentials<C extends Credentials | undefined>(credentials: C): C {
        if (credentials && !this._isCompatibleCredentials(credentials)) {
            throw new AuthSchemeError(`Credentials ${credentials.constructor.name}(${Object.keys(credentials)}) is not compatible with ${this.constructor.name}`);
        }
        else {
            return credentials;
        }
    }
}

/**
 * The AuthScheme class used when an authentication scheme is unsupported. All of its methods just throw AuthSchemeError
 * or return `false`.
 */
export class UnknownAuthScheme extends AuthScheme<Credentials> {
    constructor(scheme = 'unknown') {
        super(scheme);
    }

    async createAuthorization(_challenge?: WWWAuthenticate, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<Authorization | undefined> {
        throw new AuthSchemeError(`Not supported`);
    }

    async verifyAuthorization<T extends Authorization | undefined>(_authorization: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        throw new AuthSchemeError(`Not supported`);
    }

    async verifyAuthenticationInfo<T extends AuthenticationInfo | ServerAuthorization | undefined>(_authentication: T, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<T> {
        throw new AuthSchemeError(`Not supported`);
    }

    _isCompatibleCredentials(_credentials: Credentials): boolean {
        return false;
    }
}
