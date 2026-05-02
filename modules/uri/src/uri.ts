import { asError, esxxEncoder, percentEncode, Record, toString } from '@divine/commons';
import { Authorization, ContentType, WWWAuthenticate } from '@divine/headers';
import url, { Url, URL } from 'url';
import { AuthScheme, AuthSchemeRequest } from './auth-schemes';
import { guessContentType } from './file-utils';
import { AuthSelector, AuthSessionSelector, getBestSelector, HeadersSelector, isAuthSelector, isHeadersSelector, isParamsSelector, isSameSelector, isSessionSelector, ParamsSelector, SelectorBase, SessionSelector, updateSelector } from './selectors';
import { HEADERS, Metadata, Params, STATUS, STATUS_TEXT, Wrap } from './uri-types';

export { AuthSelector, HeadersSelector, ParamsSelector, Selector } from './selectors';

const urlObject  = (url as any).Url;

export class URIString extends String {}

/**
 * A template literal tag function that applies {@link percentEncode} to all arguments.
 *
 * Note that the result is passed through {@link uri.raw}, meaning that it will not be escaped again if passed to
 * another {@link uri} template literal. This allows you to construct a URI in multiple steps without having to worry
 * about double-encoding.
 *
 * @param strings  The template string array.
 * @param values   The values to be encoded.
 * @returns        An String object with the arguments encoded.
 */
export function uri(strings: TemplateStringsArray, ...values: unknown[]): URIString {
    const result = strings[0] + values.map((valueOrArray, i) =>
            (Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray])
                .map(value => (value instanceof URIString ? value.toString() : percentEncode(toString(value)))).join('')
            + strings[i + 1]
        ).join('');

    return uri.raw(result);
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace uri {
    /**
     * Constructs a special String object that *will not* be escaped when passed to {@link uri}.
     *
     * @param raw   The raw string to be used in the template literal.
     * @returns     A String that will not be escaped when passed to {@link uri}.
     */
    export function raw(raw: string): URIString {
        return new URIString(raw);
    }
}

/** Filesystem metadata, returned by {@link URI['info']} and {@link URI['list']}. */
export interface DirectoryEntry {
    /** The URI this entry describes. */
    uri:      URI;

    /** The name of the entry. */
    name:     string;

    /** The MIME type of the entry. */
    type:     ContentType;

    /** The entry length, in bytes. */
    length?:  number;

    /** When the entry was created. */
    created?: Date;

    /** When the entry was last modified. */
    updated?: Date;
}

/**
 * A general I/O error exception. Base class for all exceptions in this module.
 */
export class IOError<D extends object = object> extends URIError {
    /** The Error that caused this exception to be thrown. */
    override cause?: Error;

    /**
     * Constructs a new IOError exception.
     *
     * @param message  The error message.
     * @param cause    If this error was caused by another exception, pass it here to link it.
     * @param data     Custom, per-exception information associated with the exception.
     */
    constructor(message: string, cause?: Error | unknown, public data?: D & Metadata) {
        super(cause instanceof Error ? `${message}: ${cause.message}` : message);
        this.cause = cause !== undefined ? asError(cause) : undefined;
    }

    /** @returns This IOError represented as a string. */
    override toString(): string {
        return `[${this.constructor.name}: ${this.message}]`
    }
}

/**
 * The mother of all URI classes.
 *
 * Literally: This is the base class for all URI subclasses, which are the classes that actually implement a specific
 * URI protocol.
 *
 * Figuratively: This class defines a basic API that operates on any resource that can be described by or referenced
 * with an URI. It integrates pluggable {@link Parser | parsers and serializers},
 * {@link Encoder | encoders and decoders} and {@link AuthScheme | authentication methods} to load, save, modify, delete
 * any resource in any format, using any transport/transfer encoding and any authentication protocol.
 *
 * The URI class naturally handles all kinds of URLs, like {@link FileURI | `file:`} and {@link HTTPURI | `http:`}, but
 * also some — perhaps no so obvious — non-URL URIs like {@link DatabaseURI | database connections} for many common SQL
 * databases.
 *
 * Below is a list of all known URI/protocol handlers:
 *
 * URI scheme/protocol | URI class
 * --------------------|---------------
 * `cache:`            | {@link CacheURI}
 * `data:`             | {@link DataURI}
 * `file:`             | {@link FileURI}
 * `http:`             | {@link HTTPURI}
 * `https:`            | {@link HTTPURI}
 * `jdbc:`             | {@link @divine/uri-jdbc-protocol!JDBCURI}
 * `mariadb:`          | {@link @divine/uri-mysql-protocol!MySQLURI}
 * `mysql:`            | {@link @divine/uri-mysql-protocol!MySQLURI}
 * `pg:`               | {@link @divine/uri-postgres-protocol!PostgresURI}
 * `postgres:`         | {@link @divine/uri-postgres-protocol!PostgresURI}
 * `postgresql:`       | {@link @divine/uri-postgres-protocol!PostgresURI}
 * `sqlite:`           | {@link @divine/uri-sqlite-protocol!SQLiteURI}
 * `sqlserver:`        | {@link @divine/uri-tds-protocol!TDSURI}
 * `tds:`              | {@link @divine/uri-tds-protocol!TDSURI}
 */
export class URI extends URL implements AsyncIterable<Buffer> {
    /**
     * Registers a new URI protocol. All subclasses must register their URL protocol support with this method.
     *
     * @param protocol  The URL protocol to register. Must include the trailing colon.
     * @param uri       The URI subclass.
     * @returns         The URI baseclass (for chaining).
     */
    static register(protocol: string, uri: typeof URI): typeof URI {
        URI._protocols.set(protocol, uri);
        return URI;
    }

    /**
     * Creates a new URI from a template string, percent-encoding all arguments.
     *
     * Example:
     *
     * ```ts
     * const href = URI.$`http://${host}/blobs/${blob}?as=${ct}
     * ```
     *
     * @param strings  The template string array.
     * @param values   The values to be encoded.
     * @returns        A new URI subclass instance.
     */
    static $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uri(strings, ...values).toString());
    }

    private static _protocols = new Map<string, typeof URI>();

    /**
     * All selectors that may apply to this URI. Use {@link addSelector} to modify this property.
     */
    selectors: {
        /** Authentication/Credentials selectors. See {@link AuthSelector}. */
        auth?:    AuthSelector[];

        /** Headers selectors. See {@link HeadersSelector}. */
        headers?: HeadersSelector[];

        /** Parameter selectos. See {@link ParamsSelector}. */
        params?:  ParamsSelector[];

        /** Session selectors. Only used internally. */
        session?: SessionSelector[];
    };

    /** This URI's string representation. Unlike in URL, this property may not be changed/updated. */
    declare readonly href: string;

    /** This URI's origin. Unlike in URL, this property may not be changed/updated. */
    declare readonly origin: string;

    /** This URI's protocol. Unlike in URL, this property may not be changed/updated. */
    declare readonly protocol: string;

    /** This URI's username. Unlike in URL, this property is always empty and may not be changed/updated. Use selectors instead. */
    declare readonly username: '';

    /** This URI's password. Unlike in URL, this property is always empty and may not be changed/updated. Use selectors instead. */
    declare readonly password: '';

    /**
     * Constructs a new URI subclass. The URI constructor is a bit unusual, as it will always return an URI subclass and
     * never a plain URI object.
     *
     * If the URI contains user information (credentials), it will be added as an {@link AuthSelector} and removed from
     * the URI.
     *
     * @param url     The URL to construct. If relative, it will be resolved as a `file:` URL relative to the current
     *                working directory. If `url` is a string *and* `params` is provided, the string may contain
     *                `{prop}` placeholders, which will then be resolved and percent-encoded against properties in
     *                `params`.
     * @param params  An optional record with parameters, used in case `url` is a string.
     */
    constructor(url?: string | URL | Url, params?: Params);
    /**
     * Constructs a new URI subclass. The URI constructor is a bit unusual, as it will always return an URI subclass and
     * never a plain URI object.
     *
     * If the URI contains user information (credentials), it will be added as an {@link AuthSelector} and removed from
     * the URI.
     *
     * NOTE: If constructed using a sole URI argument, or if `base` is an URI, all its selectors will be inherited by
     * the newly constructed URI. To create a fresh new URI without inheriting selectors, use `new URI(uri.href)`
     * instead of `new URI(uri)`.
     *
     * @param url     The URL to construct. If relative, it will be resolved against `base`. If `url` is a string *and*
     *                `params` are provided, the string may contain `{prop}` placeholders, which will then be resolved
     *                and percent-encoded against properties in `params`.
     * @param base    A base URL that `url` will be resolved relative to, in case `url` is relative. If `base` itself is
     *                relative, `base` will first be resolved as a `file:` URL relative to the current working
     *                directory. Just like `url`, if `base` is a string and `params` is provided, `{prop}` placeholders
     *                may be present in the string.
     * @param params  An optional record with parameters, used in case `url` and/or `base` is a string.
     */
    constructor(url?: string | URL | Url, base?: string | URL | Url, params?: Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url | Params, params?: Params) {
        super(resolveURL(url, base, params).href);

        if (arguments.length === 1 && this.constructor !== URI && url instanceof URI && url.constructor === URI) {
            this.selectors = url.selectors;

            // Make readonly props actually read-only
            // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
            Object.defineProperty(this, 'href',     { get: () => super.href     });
            // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
            Object.defineProperty(this, 'origin',   { get: () => super.origin   });
            // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
            Object.defineProperty(this, 'protocol', { get: () => super.protocol });
            // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
            Object.defineProperty(this, 'username', { get: () => super.username });
            // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
            Object.defineProperty(this, 'password', { get: () => super.password });

            return;
        }

        this.selectors = arguments.length === 1 && url instanceof URI ? url.selectors : base instanceof URI ? base.selectors : {};

        if (this.username || this.password) {
            this.addSelector({ credentials: {
                identity: decodeURIComponent(this.username),
                secret:   decodeURIComponent(this.password),
            }});

            // Always strip credentials from URI for security reasons
            this.username = this.password = '';
        }

        return new (this.protocol && URI._protocols.get(this.protocol) || UnknownURI)(this);
    }

    /**
     * Constructs a new URI, relative to this URI, from a template string, percent-encoding all arguments.
     *
     * Example:
     *
     * ```ts
     * const base = new URI('http://api.example.com/v1/');
     * const info = await base.$`items/${item}/info`.load();
     * ```
     *
     * @param strings  The template string array.
     * @param values   The values to be encoded.
     * @returns        A new URI subclass instance.
     */
    $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uri(strings, ...values).toString(), this);
    }

    /**
     * Adds a new selector to this URI.
     *
     * Selectors is a way to specify in what situations some kind of parameters or configuration is valid. When some
     * kind of configuration is required (such as authentication of connection parameters), all registered selectors are
     * evaluated and based on the matching score, the best selector is chosen. The more specific a selector is, the
     * higher the score it will receive if it matches.
     *
     * Based on this, it's possible to limit the scope of credentials or to configure certain HTTP headers to be sent to
     * a specific set of servers.
     *
     * It's also perfectly valid *not* to specify a selector for some kind of parameters. As long as there is only one
     * kind of this configuration, it will apply unconditionally.
     *
     * @param  selector   The selector to add.
     * @param  merge      If a selector of the same kind already exists, merge the new selector instead of replacing the
     *                    previous one. Note that merging auth selectors is not supported.
     * @throws TypeError  If the selector to add is invalid.
     * @returns           This URI.
     */
    addSelector<T extends AuthSelector | HeadersSelector | ParamsSelector | SessionSelector>(selector: T, merge = false): this {
        let valid = false;

        const addSelector = (selectors: SelectorBase[], selector: T, kind: 'auth' | 'headers' | 'params' | 'session') => {
            const existing = selectors.findIndex(s => isSameSelector(s, selector));

            if (existing === -1) {
                selectors.push(selector);
            } else {
                selectors[existing] = updateSelector(selectors[existing], selector, kind, merge);
            }
        }

        if (isAuthSelector(selector)) {
            addSelector(this.selectors.auth ??= [], selector, 'auth');
            valid = true;
        }

        if (isHeadersSelector(selector)) {
            addSelector(this.selectors.headers ??= [], selector, 'headers');
            valid = true;
        }

        if (isParamsSelector(selector)) {
            addSelector(this.selectors.params ??= [], selector, 'params');
            valid = true;
        }

        if (isSessionSelector(selector)) {
            addSelector(this.selectors.session ??= [], selector, 'session');
            valid = true;
        }

        if (!valid) {
            throw new TypeError('Invalid selector.');
        }

        return this;
    }

    /**
     * This method will return information about the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.info} or {@link HTTPURI.info} for
     * two common examples.
     *
     * @template T        The actual type of information record returned. Must extend {@link DirectoryEntry}.
     * @throws   IOError  On I/O errors or if the subclass does not support this method.
     * @returns           An information record describing the resources.
     */
    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        throw new IOError(`URI ${this} does not support info().`);
    }

    /**
     * This method will return information about this URI's children/subresources, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.info} for a common example.
     *
     * @template T        The actual type of information record returned. Must extend {@link DirectoryEntry}.
     * @throws   IOError  On I/O errors or if the subclass does not support this method.
     * @returns           An array of information record describing the subresources.
     */
    async list<T extends DirectoryEntry>(): Promise<T[] & Metadata> {
        throw new IOError(`URI ${this} does not support list().`);
    }

    /**
     * Loads and parses the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.load} or {@link HTTPURI.load} for
     * two common examples.
     *
     * See {@link Parser.parse} for details about the returned *object* (never a primitive). You may always set `recvCT`
     * to {@link ContentType.bytes} to receive a Node.js `Buffer` and {@link ContentType.stream} for an
     * `AsyncIterable<Buffer>` stream, if you prefer raw data.
     *
     * @template T            The actual type returned.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the resource.
     * @returns               The remote resource parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async load<T>(recvCT?: ContentType | string): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support load().`);
    }

    /**
     * Serializes and stores data to the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.save} or {@link HTTPURI.save} for
     * two common examples.
     *
     * See {@link Parser.parse} for details about the returned *object* (never a primitive). You may always set `recvCT`
     * to {@link ContentType.bytes} to receive a Node.js `Buffer` and {@link ContentType.stream} for an
     * `AsyncIterable<Buffer>` stream, if you prefer raw data.
     *
     * @template T            The actual type returned.
     * @template D            The type of data to store.
     * @param    data         The data to store.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               If the operation produced a result, it will be parsed as `recvCT` *into an object*,
     *                        including {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async save<T, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support save().`);
    }

    /**
     * Serializes and appends/adds data to the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.append} or {@link HTTPURI.append}
     * for two common examples.
     *
     * See {@link Parser.parse} for details about the returned *object* (never a primitive). You may always set `recvCT`
     * to {@link ContentType.bytes} to receive a Node.js `Buffer` and {@link ContentType.stream} for an
     * `AsyncIterable<Buffer>` stream, if you prefer raw data.
     *
     * @template T            The actual type returned.
     * @template D            The type of data to append.
     * @param    data         The data to append.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               If the operation produced a result, it will be parsed as `recvCT` *into an object*,
     *                        including {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async append<T, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support append().`);
    }

    /**
     * Modifies/patches data the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link HTTPURI.modify} or
     * {@link DatabaseURI.modify} for two common examples.
     *
     * See {@link Parser.parse} for details about the returned *object* (never a primitive). You may always set `recvCT`
     * to {@link ContentType.bytes} to receive a Node.js `Buffer` and {@link ContentType.stream} for an
     * `AsyncIterable<Buffer>` stream, if you prefer raw data.
     *
     * @template T            The actual type returned.
     * @template D            The type of patch data to apply.
     * @param    data         The patch data to apply.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               If the operation produced a result, it will be parsed as `recvCT` *into an object*,
     *                        including {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async modify<T, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support modify().`);
    }

    /**
     * Removes the resource this URI references, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.remove} or {@link HTTPURI.remove}
     * for two common examples.
     *
     * See {@link Parser.parse} for details about the returned *object* (never a primitive). You may always set `recvCT`
     * to {@link ContentType.bytes} to receive a Node.js `Buffer` and {@link ContentType.stream} for an
     * `AsyncIterable<Buffer>` stream, if you prefer raw data.
     *
     * @template T            The actual type returned.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               If the operation produced a result, it will be parsed as `recvCT` *into an object*,
     *                        including {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async remove<T>(recvCT?: ContentType | string): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support remove().`);
    }

    /**
     * A generic method that sends/applies some kind of query to the resource and returns a response.
     *
     * The actual operation depends on what kind of URI this is. See {@link HTTPURI.query} or {@link DatabaseURI.query}
     * for two common examples.
     *
     * @template T            The actual type returned.
     * @param    args         Depends on the subclass.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               If the operation produced a result, it will returned together with {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async query<T>(...args: unknown[]): Promise<Wrap<T> & Metadata> {
        throw new IOError(`URI ${this} does not support query().`);
    }

    /**
     * Watches a resource for changes and returns a stream of subclass-specific events, if the subclass supports it.
     *
     * The actual operation depends on what kind of URI this is. See {@link FileURI.watch} or {@link DatabaseURI.watch}
     * for two common examples.
     *
     * @param    args         Depends on the subclass.
     * @throws   IOError      On I/O errors or if the subclass does not support this method.
     * @throws   ParserError  If the media type is unsupported or the parser fails to parse the response.
     * @returns               A stream of change events together with {@link MetaData}.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-yield
    async *watch(...args: unknown[]): AsyncIterable<object & Metadata> {
        throw new IOError(`URI ${this} does not support watch().`);
    }

    /**
     * Closes this URI and frees any temporary resources in use.
     *
     * URIs are usually stateless, but some protocols may use a connection pool, and this method can be used to shut
     * down the pool and all remaining connections that may otherwise prevent the process from exiting.
     */
    async close(): Promise<void> {
        // No-op by default
    }

    /**
     * All URIs are `AsyncIterable<Buffer>`. This method implements that interface by calling
     * {@link load}({@link @divine/headers!ContentType.stream}).
     *
     * @returns An `AsyncIterator<Buffer>` stream.
     * @yields  `Buffer` chunks of the resource.
     */
    async *[Symbol.asyncIterator](): AsyncIterator<Buffer> & Metadata {
        return yield* await this.load<AsyncIterable<Buffer>>('application/vnd.esxx.octet-stream');
    }

    protected set _href(href: string) {
        // @ts-expect-error: Class field 'origin' defined by the parent class is not accessible in the child class via super.ts(2855)
        super.href = href;
    }

    protected async _getAuthorization(req: AuthSchemeRequest, payload?: Buffer | AsyncIterable<Buffer>, challenges?: WWWAuthenticate[]): Promise<Authorization | undefined> {
        let session = this._getBestSelector<AuthSessionSelector>(this.selectors.session)?.states;

        if (!session?.authScheme) {
            const { auth, challenge } = (challenges?.length ? challenges : [undefined as WWWAuthenticate | undefined])
                .map((challenge) => ({ auth: this._getBestSelector(this.selectors.auth, challenge), challenge }))
                .filter((entry) => !!entry.auth)[0]
                ?? { auth: null, challenge: null };

            if (auth && (challenge || auth.preemptive)) {
                if (!session) {
                    session = Record();
                    this.addSelector<AuthSessionSelector>({ states: session });
                }

                if (auth.credentials instanceof AuthScheme) {
                    session.authScheme = auth.credentials;
                }
                else if (challenge) {
                    session.authScheme = AuthScheme.create(challenge).setCredentialsProvider(auth.credentials);
                }
                else if (auth.selector?.authScheme) {
                    session.authScheme = AuthScheme.create(auth.selector.authScheme).setCredentialsProvider(auth.credentials);
                }
                else {
                    throw new IOError(`Cannot send credentials preemptively without an authScheme selector.`);
                }
            }
        }

        const challenge = challenges?.find((challenge) => challenge.scheme === session?.authScheme?.scheme);
        return session?.authScheme?.createAuthorization(challenge, req, payload instanceof Buffer ? payload : undefined);
    }

    protected _guessContentType(knownContentType?: ContentType | string): ContentType | undefined {
        return guessContentType(this.pathname, knownContentType);
    }

    protected _makeIOError(err: NodeJS.ErrnoException | IOError | unknown): IOError {
        return err instanceof IOError ? err : new IOError(`URI ${this} operation failed`, err, metadata(err));
    }

    protected _getBestSelector<T extends SelectorBase>(sels: T[] | undefined, challenge?: WWWAuthenticate): T | null {
        return getBestSelector(sels, this, challenge);
    }
}

class UnknownURI extends URI {}

function metadata(_err: NodeJS.ErrnoException | unknown): Metadata {
    const err: NodeJS.ErrnoException = asError(_err);

    return {
        [STATUS]:      typeof err.errno === 'number' ? err.errno : -1,
        [STATUS_TEXT]: err.code ?? err.constructor?.name,
        [HEADERS]:     Record(Object.entries(err).filter(([name]) => !/^(errno|code|message|stack)$/.test(name))),
    };
}

function resolveURL(url?: string | URL | Url, base?: string | URL | Url | Params, params?: Params): URL {
    try {
        // base argument is optional ...
        if (params === undefined && typeof base !== 'string' && !(base instanceof URL) && !(base instanceof urlObject)) {
            params = base as Params | undefined;
            base   = undefined;
        }

        if (typeof url === 'string' && params) {
            url = esxxEncoder(url, params, percentEncode);
        }
        else if (url instanceof urlObject) {
            url = (url as Url).href;
        }

        if (typeof base === 'string' && params) {
            base = esxxEncoder(base, params, percentEncode);
        }
        else if (base instanceof urlObject) {
            base = (base as Url).href;
        }

        if (url instanceof URL && base === undefined && params === undefined) {
            return url;
        }
        else {
            return new URL(url?.toString() ?? '', new URL(base?.toString() ?? '', `file://${process.cwd()}/`));
        }
    }
    catch (err) {
        throw new IOError(`Failed to construct URI.`, err, metadata(err));
    }
}
