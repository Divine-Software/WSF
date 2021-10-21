import { BasicTypes, esxxEncoder, Params, StringParams } from '@divine/commons';
import { Authorization, ContentType, WWWAuthenticate } from '@divine/headers';
import url, { Url, URL } from 'url';
import { AuthScheme, AuthSchemeRequest } from './auth-schemes';
import { guessContentType, uri } from './file-utils';
import type { AuthSelector, AuthSessionSelector, HeadersSelector, ParamsSelector, SelectorBase, SessionSelector } from './selectors';
import { enumerateSelectors, isAuthSelector, isHeadersSelector, isParamsSelector, isSessionSelector } from './selectors';

export { AuthSelector, HeadersSelector, ParamsSelector, Selector } from './selectors';

const urlObject  = (url as any).Url;

export const NULL        = Symbol('NULL');
export const VOID        = Symbol('VOID');

export const FIELDS      = Symbol('FIELDS');
export const FINALIZE    = Symbol('FINALIZE');

export const HEADERS     = Symbol('HEADERS');
export const STATUS      = Symbol('STATUS');
export const STATUS_TEXT = Symbol('STATUS_TEXT');

export interface Finalizable {
    [FINALIZE]?: () => Promise<unknown>;
}

export interface WithFields<T extends BasicTypes> {
    [FIELDS]?: T[];
}

export interface Metadata {
    [STATUS]?:      number;
    [STATUS_TEXT]?: string;
    [HEADERS]?:     StringParams;
}

export interface DirectoryEntry {
    uri:      URI;
    name:     string;
    type:     ContentType;
    length?:  number;
    created?: Date;
    updated?: Date;
}

export class IOError extends URIError {
    constructor(message: string, public cause?: Error, public data?: object & Metadata) {
        super(cause ? `${message}: ${cause.message}` : message);
    }

    toString(): string {
        return `${this.constructor.name}: ${this.message}`
    }
}

export class URI extends URL {
    static readonly VOID        = VOID;
    static readonly NULL        = NULL;
    static readonly FIELDS      = FIELDS;
    static readonly FINALIZE    = FINALIZE;
    static readonly HEADERS     = HEADERS;
    static readonly STATUS      = STATUS;
    static readonly STATUS_TEXT = STATUS_TEXT;

    static register(protocol: string, uri: typeof URI): typeof URI {
        URI._protocols.set(protocol, uri);
        return URI;
    }

    static $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uri(strings, ...values));
    }

    private static _protocols = new Map<string, typeof URI>();

    selectors: {
        auth?:    AuthSelector[];
        headers?: HeadersSelector[];
        params?:  ParamsSelector[];
        session?: SessionSelector[];
    };

    readonly href!: string;
    readonly origin!: string;
    readonly protocol!: string;

    constructor(url?: string | URL | Url, params?: Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url, params?: Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url | Params, params?: Params) {
        super(resolveURL(url, base, params).href);

        if (arguments.length === 1 && this.constructor !== URI && url instanceof URI && url.constructor === URI) {
            this.selectors = url.selectors;
            return;
        }

        this.selectors = base instanceof URI ? base.selectors : {};

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

    $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uri(strings, ...values), this);
    }

    addSelector<T extends AuthSelector | HeadersSelector | ParamsSelector | SessionSelector>(selector: T): this {
        let valid = false;

        if (isAuthSelector(selector)) {
            (this.selectors.auth ??= []).push(selector);
            valid = true;
        }

        if (isHeadersSelector(selector)) {
            (this.selectors.headers ??= []).push(selector);
            valid = true;
        }

        if (isParamsSelector(selector)) {
            (this.selectors.params ??= []).push(selector);
            valid = true;
        }

        if (isSessionSelector(selector)) {
            (this.selectors.session ??= []).push(selector);
            valid = true;
        }

        if (!valid) {
            throw new TypeError('Invalid selector');
        }

        return this;
    }

    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support info()`);
    }

    async list<T extends DirectoryEntry>(): Promise<T[] & Metadata> {
        throw new TypeError(`URI ${this} does not support list()`);
    }

    async load<T extends object>(_recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support load()`);
    }

    async save<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support save()`);
    }

    async append<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support append()`);
    }

    async modify<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support modify()`);
    }

    async remove<T extends object>(_recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support remove()`);
    }

    async query<T extends object>(..._args: unknown[]): Promise<T & Metadata> {
        throw new TypeError(`URI ${this} does not support query()`);
    }

    // eslint-disable-next-line require-yield
    async *watch(..._args: unknown[]): AsyncIterable<object & Metadata> {
        throw new TypeError(`URI ${this} does not support watch()`);
    }

    async close(): Promise<void> {
        // No-op by default
    }

    async *[Symbol.asyncIterator](): AsyncIterable<Buffer> & Metadata {
        return yield* await this.load<AsyncIterable<Buffer>>('application/vnd.esxx.octet-stream');
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
                    session = {};
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
            }
        }

        const challenge = challenges?.find((challenge) => challenge.scheme === session?.authScheme?.scheme);
        return session?.authScheme?.createAuthorization(challenge, req, payload instanceof Buffer ? payload : undefined);
    }

    protected _guessContentType(knownContentType?: ContentType | string): ContentType | undefined {
        return guessContentType(this.pathname, knownContentType);
    }

    protected _makeIOError(err: NodeJS.ErrnoException): IOError {
        return new IOError(`URI ${this} operation failed`, err, err instanceof IOError ? undefined : metadata(err));
    }

    protected _getBestSelector<T extends SelectorBase>(sels: T[] | undefined, challenge?: WWWAuthenticate): T | null {
        return this._filterSelectors(sels, challenge)[0] ?? null;
    }

    protected _filterSelectors<T extends SelectorBase>(sels: T[] | undefined, challenge?: WWWAuthenticate): T[] {
        return [...enumerateSelectors(sels, this, challenge)]
            .sort((a, b) => b.score - a.score /* Best first */)
            .map((e) => e.sel);
    }
}

class UnknownURI extends URI {}

function metadata(err: NodeJS.ErrnoException): Metadata {
    return {
        [STATUS]:      typeof err.errno === 'number' ? -err.errno : -1,
        [STATUS_TEXT]: err.code ?? err.constructor?.name,
        [HEADERS]:     Object.fromEntries(Object.entries(err).filter(([name]) => !/^(errno|code|message|stack)$/.test(name))),
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
            url = esxxEncoder(url, params, encodeURIComponent);
        }
        else if (url instanceof urlObject) {
            url = (url as Url).href;
        }

        if (typeof base === 'string' && params) {
            base = esxxEncoder(base, params, encodeURIComponent);
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
        throw new IOError(`Failed to construct URI`, err, metadata(err));
    }
}
