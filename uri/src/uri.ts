import { ContentType, KVPairs, WWWAuthenticate } from '@divine/headers';
import { lookup } from 'mime-types';
import path from 'path';
import url, { Url, URL } from 'url';
import { AuthScheme, Credentials, CredentialsProvider } from './auth-schemes';
import * as utils from './utils';

export const VOID        = Symbol('VOID');
export const NULL        = Symbol('NULL');
export const HEADERS     = Symbol('HEADERS');
export const STATUS      = Symbol('STATUS');
export const STATUS_TEXT = Symbol('STATUS_TEXT');

const urlObject  = (url as any).Url;

export interface Metadata {
    [STATUS]?:      number;
    [STATUS_TEXT]?: string;
    [HEADERS]?:     KVPairs;
}

export interface Selector {
    authRealm?:  string | RegExp;
    authScheme?: string | RegExp;
    protocol?:   string | RegExp;
    pathname?:   string | RegExp;
    port?:       string | RegExp | number;
    hostname?:   string | RegExp;
    uri?:        string | RegExp;
}

interface SelectorBase {
    selector: Selector;
}

export interface AuthSelector extends SelectorBase {
    credentials: CredentialsProvider<Credentials> | Credentials | AuthScheme<Credentials>;
    preemptive?: boolean;
}

export interface HeadersSelector extends SelectorBase {
    headers: KVPairs;
}

export interface ParamsSelector extends SelectorBase {
    params: KVPairs;
}

export interface SessionSelector extends SelectorBase {
    authScheme?: AuthScheme<Credentials>;
}

export interface DirectoryEntry {
    uri:      string;
    name:     string;
    type:     string;
    length?:  number;
    created?: Date;
    updated?: Date;
}

export class URIException extends URIError {
    constructor(message: string, public cause?: Error, public data?: object & Metadata) {
        super(cause ? `${message}: ${cause.toString()}` : message);
    }
}

export function uri(strings: TemplateStringsArray, ...values: unknown[]): string {
    return utils.es6Encoder(strings, values, encodeURI);
}

export function uriComponent(strings: TemplateStringsArray, ...values: unknown[]): string {
    return utils.es6Encoder(strings, values, encodeURIComponent);
}

export function encodeFilePath(filepath: string, type?: 'posix' | 'windows'): string {
    type = type || process.platform === 'win32' ? 'windows' : 'posix';

    if (type === 'windows') {
        filepath = path.win32.normalize(filepath);

        let prefix = '';

        if (/^[A-Za-z]:/.test(filepath)) {
            prefix = '///' + filepath.substr(0, 2).toUpperCase();
            filepath = filepath.substr(2);
        }

        return prefix + filepath.split(/\\/).map((part) => encodeURIComponent(part)).join('/');
    }
    else if (type === 'posix') {
        filepath = path.posix.normalize(filepath);

        return filepath.split('/').map((part) => encodeURIComponent(part)).join('/');
    }
    else {
        throw new URIException(`Invalid filepath type: ${type}`);
    }
}

export class URI extends URL {
    static readonly VOID        = VOID;
    static readonly NULL        = VOID;
    static readonly HEADERS     = HEADERS;
    static readonly STATUS      = STATUS;
    static readonly STATUS_TEXT = STATUS_TEXT;

    static register(protocol: string, uri: typeof URI): typeof URI {
        URI.protocols.set(protocol, uri);
        return URI;
    }

    static $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uriComponent(strings, ...values));
    }

    private static protocols = new Map<string, typeof URI>();

    selectors?: {
        auth?:    AuthSelector[];
        header?:  HeadersSelector[];
        param?:   ParamsSelector[];
        session?: SessionSelector[];
    };

    readonly href!: string;
    readonly origin!: string;
    readonly protocol!: string;

    constructor(url?: string | URL | Url, params?: utils.Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url, params?: utils.Params);
    constructor(url?: string | URL | Url, base?: string | URL | Url | utils.Params, params?: utils.Params) {
        super(resolveURL(url, base, params).href);

        if (arguments.length === 1 && this.constructor !== URI && url instanceof URI && url.constructor === URI) {
            this.selectors = url.selectors;
            return;
        }

        if (base instanceof URI) {
            this.selectors = base.selectors;
        }

        if (this.username || this.password) {
            // this.auth = ...;

            // Always strip credentials from URI for security reasons
            this.username = this.password = '';
        }

        return new (this.protocol && URI.protocols.get(this.protocol) || UnknownURI)(this);
    }

    $(strings: TemplateStringsArray, ...values: unknown[]): URI {
        return new URI(uriComponent(strings, ...values), this);
    }

    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support info()`);
    }

    async list<T extends DirectoryEntry>(): Promise<T[] & Metadata> {
        throw new URIException(`URI ${this} does not support list()`);
    }

    async load<T extends object>(_recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support load()`);
    }

    async save<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support save()`);
    }

    async append<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support append()`);
    }

    async modify<T extends object>(_data: unknown, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support modify()`);
    }

    async remove<T extends object>(_recvCT?: ContentType | string): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support remove()`);
    }

    async query<T extends object>(..._args: unknown[]): Promise<T & Metadata> {
        throw new URIException(`URI ${this} does not support query()`);
    }

    protected guessContentType(knownContentType?: ContentType | string): ContentType | undefined {
        const ct = knownContentType ?? lookup(this.pathname);

        return ct instanceof ContentType ? ct : ct ? new ContentType(ct) : undefined;
    }

    protected makeException(err: NodeJS.ErrnoException): URIException {
        return err instanceof URIException ? err : new URIException(`URI ${this} operation failed`, err, metadata(err));
    }

    protected getBestSelector<T extends SelectorBase>(sels: T[] | undefined, challenge?: WWWAuthenticate): T | null {
        let result: T | null = null;
        let bestScore = -1;

        for (const e of enumerateSelectors(sels, this, challenge)) {
            if (e.score > bestScore) {
                result = e.sel;
                bestScore = e.score;
            }
        }

        return result;
    }

    protected filterSelectors<T extends SelectorBase>(sels: T[] | undefined, challenge?: WWWAuthenticate): T[] {
        return [...enumerateSelectors(sels, this, challenge)].map((e) => e.sel);
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

function resolveURL(url?: string | URL | Url, base?: string | URL | Url | utils.Params, params?: utils.Params): URL {
    try {
        // base argument is optional ...
        if (params === undefined && typeof base !== 'string' && !(base instanceof URL) && !(base instanceof urlObject)) {
            params = base as utils.Params | undefined;
            base   = undefined;
        }

        // ... and so is params
        if (params !== undefined) {
            params = utils.kvWrapper(params);
        }

        if (typeof url === 'string' && params) {
            url = utils.esxxEncoder(url, params, encodeURIComponent);
        }
        else if (url instanceof urlObject) {
            url = (url as Url).href;
        }

        if (typeof base === 'string' && params) {
            base = utils.esxxEncoder(base, params, encodeURIComponent);
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
        throw new URIException(`Failed to construct URI`, err, metadata(err));
    }
}

function *enumerateSelectors<T extends SelectorBase>(sels: T[] | undefined, url: URL, challenge?: WWWAuthenticate): Generator<{ sel: T, score: number }> {
    for (const sel of sels ?? []) {
        let score = 0;

        score += selectorScore(sel, 'authRealm',  challenge?.realm)  * 1;
        score += selectorScore(sel, 'authScheme', challenge?.scheme) * 2;
        score += selectorScore(sel, 'protocol',   url.protocol)      * 4;
        score += selectorScore(sel, 'pathname',   url.pathname)      * 8;
        score += selectorScore(sel, 'port',       url.port)          * 16;
        score += selectorScore(sel, 'hostname',   url.hostname)      * 32;
        score += selectorScore(sel, 'uri',        url.toString())    * 64;

        if (score >= 0) {
            yield { sel, score };
        }
    }
}

function selectorScore(sel: SelectorBase, key: keyof Selector, value?: string): number {
    const expected = sel.selector[key];

    if (expected === undefined || value === undefined) {
        return 0;
    }
    else if (expected instanceof RegExp) {
        return expected.test(value) ? 1 : -Infinity;
    }
    else {
        return String(expected) === value ? 1 : -Infinity;
    }
}