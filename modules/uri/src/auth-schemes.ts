import { AuthenticationInfo, AuthHeader, Authorization, ServerAuthorization, WWWAuthenticate } from '@divine/headers';
import { URL } from 'url';
import { IOError } from './uri';
import { Metadata } from './uri-types';

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
export class AuthSchemeError<D extends object = object> extends IOError<D> {
    /**
     * Constructs a new AuthSchemeError exception.
     *
     * @template D       The type of the `data` propery.
     * @param message    The error message.
     * @param challenge  An optional challenge in case the client should retry the operation.
     * @param cause      If this error was caused by another exception, pass it here to link it.
     * @param data       Custom, per-exception information associated with the exception.
     */
    constructor(message: string, public challenge?: WWWAuthenticate, cause?: Error, data?: D & Metadata) {
        super(message, cause, data);
    }
}

/**
 * Parameters for a {@link CredentialsProvider}.
 *
 * @template C  The type of credentials that is to be provied.
 */
export interface CredentialsProviderOptions<C extends Credentials> {
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
 * A function used to provide or verify credentials for a request.
 *
 * * When retrieving credentials, the provider should return the credentials to send, or `undefined` if none are
 *   available.
 * * When validating credentials, the provider may either return credentials that will be checked against the
 *   user-provided credentials by the AuthScheme, or handle the verification internally and signal the validity by
 *   returning a boolean.
 *
 * @template C        The type of credentials that is to be provided.
 * @param    mode     If credentials should be provided (`retrieve`) or checked for validity (`verify`).
 * @param    options  Information about the request.
 * @returns           (Unverified) credentials, if available, else `undefined`. In `verify` mode, a boolean indicating
 *                    validity may also be returned, in case the credential provider handles the verification itself.
 *
 */
export type CredentialsProvider<C extends Credentials> = (mode: 'retrieve' | 'verify', options: CredentialsProviderOptions<C>) => Promise<C | boolean | undefined>;

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
    static register<C extends Credentials>(scheme: string, authScheme: typeof AuthScheme<C>): typeof AuthScheme {
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
            return new (AuthScheme._authSchemes.get(from.scheme) ?? UnknownAuthScheme)(from.scheme).setProxyMode(proxy ?? from.isProxyHeader());
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

    /** Specifies whether or not this scheme provides proxy authentication. Usually false. */
    public proxy: boolean;
    private _credentialsProvider?: CredentialsProvider<C>;

    /**
     * Constructs a new AuthScheme instance.
     *
     * @param scheme  The canonical name of the scheme this instance handles.
     */
    protected constructor(protected _scheme: string) {
        this.proxy = false;
    }

    get scheme(): string {
        return this._scheme.toLowerCase();
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
     * @param  challenge          An optional challenge sent by the remote server.
     * @param  request            The request that is to be authenticated.
     * @param  payload            The request payload that will be sent.
     * @throws {AuthSchemeError}  If the challenge or the credentials provided via {@link setCredentialsProvider} are
     *                            incompatibe with this AuthScheme.
     * @returns                   An Authorization header with the provided credentials.
     */
    abstract createAuthorization(challenge?: WWWAuthenticate, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<Authorization | undefined>;

    /**
     * Verifies an {@link Authorization} header from an incoming request.
     *
     * @param  authorization      The authentication provided by the remote client.
     * @param  request            The request that is to be authenticated.
     * @param  payload            The request payload that was sent.
     * @throws {AuthSchemeError}  If the authentication or the credentials provided via {@link setCredentialsProvider}
     *                            are invalid or incompatibe with this AuthScheme.
     * @returns                   The identity of the authenticated client/credentials.
     */
    abstract verifyAuthorization(authorization: Authorization | undefined, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<string>;

    /**
     * Verifies an {@link AuthenticationInfo} or {@link ServerAuthorization} header received from a server response.
     *
     * Not all protocols supports verification of responses. In that case, this method is undefined.
     *
     * @param  authentication     The authentication provided by the remote server.
     * @param  request            The *response* to a request that is to be authenticated.
     * @param  payload            The *response* payload received from the remote server.
     * @throws {AuthSchemeError}  If the authentication or the credentials provided via {@link setCredentialsProvider}
     *                            are invalid or incompatibe with this AuthScheme.
     * @returns                   The identity of the authenticated server/credentials.
     */
    abstract verifyAuthenticationInfo?(authentication: AuthenticationInfo | ServerAuthorization | undefined, request?: AuthSchemeRequest, payload?: Uint8Array): Promise<string>;

    /**
     * Checks if the provided credentials are compatible with this AuthScheme.
     *
     * @param  credentials        The credentials to check for compatibility.
     * @throws {AuthSchemeError}  If the credentials provided are incompatibe with this AuthScheme.
     * @returns                   `true` if the provided credentials are usable by this AuthScheme.
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

        return new WWWAuthenticate(this._scheme, proxyHeader).setParam('realm', this.realm);
    }

    /**
     * Asks the credentials provider for credentials.
     *
     * @param  options            Options to pass to the credentials provider.
     * @throws {AuthSchemeError}  If the authentication, challenge or the credentials provided via
     *                            {@link setCredentialsProvider} are incompatibe with this AuthScheme.
     * @throws {TypeError}        If the return value from the provider is not an object.
     * @returns                   Valid credentials to provide or `undefined` if no credentials could be provided.
     */
    protected async _retrieveCredentials(options: CredentialsProviderOptions<C>): Promise<C | undefined> {
        this._assertCompatibleAuthHeader(options.authorization);
        this._assertCompatibleAuthHeader(options.challenge);

        const credentials = await this._credentialsProvider?.('retrieve', options);

        if (credentials !== undefined && typeof credentials !== 'object') {
            throw new TypeError(`Expected retrieved credentials from provider to be an object, not '${typeof credentials}'.`);
        } else {
            return this._assertCompatibleCredentials(credentials);
        }
    }

    /**
     * Asks the credentials provider to verify the provided authorization or return trusted credentials.
     *
     * @param  options            Options to pass to the credentials provider.
     * @throws {AuthSchemeError}  If the authentication, challenge or the credentials provided via
     *                            {@link setCredentialsProvider} are incompatible with this AuthScheme.
     * @throws {TypeError}        If the return value from the provider is not an object.
     * @returns                   Valid credentials to verify against, a boolean indicating verification result, or
     *                            `undefined` if no credentials could be provided.
     */
    protected async _verifyCredentials(options: CredentialsProviderOptions<C>): Promise<C | boolean | undefined> {
        this._assertCompatibleAuthHeader(options.authorization);
        this._assertCompatibleAuthHeader(options.challenge);

        const credentials = await this._credentialsProvider?.('verify', options);
        return typeof credentials === 'object' ? this._assertCompatibleCredentials(credentials) : credentials;
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
     * @param   header             The header to check, or `undefined` to do nothing.
     * @throws  {AuthSchemeError}  If the header is incompatible with this AuthScheme.
     * @returns                    The provided header.
     */
    protected _assertCompatibleAuthHeader<H extends AuthHeader | undefined>(header: H): H {
        if (header !== undefined && header.scheme !== this.scheme) {
            throw new AuthSchemeError(`Expected auth-scheme '${this.scheme}' in header, not '${header.scheme}'.`);
        }
        else {
            return header;
        }
    }

    /**
     * Asserts that some credentials are compatible with this AuthScheme.
     *
     * @template C                  The type of credentials that the scheme uses.
     * @param    credentials        The credentials to check, or `undefined` to do nothing.
     * @throws   {AuthSchemeError}  If the credentials are incompatible with this AuthScheme.
     * @returns                     The provided credentials.
     */
     protected _assertCompatibleCredentials<C extends Credentials | undefined>(credentials: C): C {
        if (credentials && !this._isCompatibleCredentials(credentials)) {
            throw new AuthSchemeError(`Credentials ${credentials.constructor.name}(${Object.keys(credentials)}) is not compatible with ${this.constructor.name}.`);
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

    override async createAuthorization(_challenge?: WWWAuthenticate, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<Authorization | undefined> {
        throw new AuthSchemeError(`Not supported.`);
    }

    override async verifyAuthorization(_authorization: Authorization | undefined, _request?: AuthSchemeRequest, _payload?: Uint8Array): Promise<string> {
        throw new AuthSchemeError(`Not supported.`);
    }

    override verifyAuthenticationInfo = undefined;

    protected override _isCompatibleCredentials(_credentials: Credentials): boolean {
        return false;
    }
}
