
import * as uri        from 'uri-js';
import * as url        from 'url';
import * as utils      from './utils';

const URI_OPTIONS: uri.URIOptions = {
    domainHost:     true,
    iri:            true,
    unicodeSupport: true,
};

export type  ContentType  = utils.ContentType;
export const ContentType  = utils.ContentType;
export type  URIException = utils.URIException;
export const URIException = utils.URIException;

export interface Headers {
    [key: string]: string | undefined;
}

export interface DirectoryEntry {
    name: string;
    length?: number;
    type: string;
    created?: Date;
    updated?: Date;
}

export class URI {
    static readonly headers       = Symbol('Used to access the response headers');
    static readonly trailers      = Symbol('Used to access the response trailers');
    static readonly statusCode    = Symbol('Used to access the response status code');
    static readonly statusMessage = Symbol('Used to access the response status message');

    static register(scheme: string, uri: typeof URI): typeof URI {
        URI.protocols.set(scheme, uri);
        return URI;
    }


    static $(strings: TemplateStringsArray, ...values: any[]): URI {
        return new URI(URI.encodeURIComponent(strings, ...values));
    }

    static encodeURI(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURI);
    }

    static encodeURIComponent(strings: TemplateStringsArray, ...values: any[]): string {
        return utils.es6Encoder(strings, values, encodeURIComponent);
    }


    private static protocols = new Map<string, typeof URI>();

    params: any;
    auth: any;
    jars: any;
    headers: any;

    private uri: uri.URIComponents;

    constructor(base: string | URI | url.Url, relative?: string | URI | url.Url , params?: utils.Params) {
        if (arguments.length === 1 && this.constructor !== URI && base.constructor === URI) {
            Object.assign(this, base);
            return;
        }

        const Url = (url as any).Url;

        // relative argument is optional ...
        if (params === undefined && typeof relative !== 'string' && !(relative instanceof URI) && !(relative instanceof Url)) {
            params   = relative as any;
            relative = undefined;
        }

        // ... and so is params
        if (params !== undefined) {
            params = utils.kvWrapper(params);
        }

        if (typeof base === 'string') {
            if (params !== undefined) {
                base = utils.esxxEncoder(base, params, encodeURIComponent);
            }

            this.uri = uri.parse(base, URI_OPTIONS);
        }
        else if (base instanceof URI) {
            this.uri     = base.uri;
            this.params  = base.params;
            this.auth    = base.auth;
            this.jars    = base.jars;
            this.headers = base.headers;
        }
        else if (base instanceof Url) {
            this.uri = uri.parse(url.format(base), URI_OPTIONS);
        }
        else {
            throw new URIException('First argument must be of type string, URI or Url');
        }

        let relativeURI: uri.URIComponents | undefined;

        if (typeof relative === 'string') {
            if (params !== undefined) {
                relative = utils.esxxEncoder(relative, params, encodeURIComponent);
            }

            relativeURI = uri.parse(relative, URI_OPTIONS);
        }
        else if (relative instanceof URI) {
            relativeURI = relative.uri;
        }
        else if (relative instanceof Url) {
            relativeURI = uri.parse(url.format(relative as url.Url), URI_OPTIONS);
        }
        else if (relative !== undefined) {
            throw new URIException('Relative argument must be type string, URI or Url, if provided');
        }

        if (this.uri.reference === 'same-document' || this.uri.reference === 'relative') {
            // base is relative -- resolve it against current working directory first
            this.uri = uri.resolveComponents(uri.parse(`file://${process.cwd()}/`, { tolerant: true }), this.uri, URI_OPTIONS, true);
        }

        if (relativeURI !== undefined) {
            if (this.uri.host !== undefined) {
                this.uri = uri.resolveComponents(this.uri, relativeURI, URI_OPTIONS, true);
            }
            else if (relativeURI.reference === 'same-document') {
                this.uri.fragment = relativeURI.fragment;
            }
            else {
                throw new URIException('Relative argument must be fragment only, if base URI is not a URL');
            }
        }

        if (this.uri.userinfo) {
            const ui = /([^:]*)(:(.*))?/.exec(this.uri.userinfo);

            if (ui) {
                this.auth = [ { username: ui[1] && decodeURIComponent(ui[1]),
                                password: ui[2] && decodeURIComponent(ui[3]) } ];
            }

            // Always strip credentials from URI for security reasons
            delete this.uri.userinfo;
        }

        this.uri = uri.normalize(this.uri);

        return new (this.uri.scheme && URI.protocols.get(this.uri.scheme) || UnknownURI)(this);
    }

    valueOf(): string {
        return uri.serialize(Object.assign({}, this.uri), {
            unicodeSupport: true,
            domainHost:     true,
        });
    }

    toString(): string {
        return uri.serialize(Object.assign({}, this.uri), URI_OPTIONS);
    }

    get uriScheme(): string {
        return this.uri.scheme as string;
    }

    get uriHost(): string | undefined {
        return this.uri.host;
    }

    get uriPort(): string | undefined {
        return this.uri.port !== undefined ? this.uri.port.toString() : undefined;
    }

    get uriPath(): string | undefined {
        return this.uri.path;
    }

    get uriQuery(): string | undefined {
        return this.uri.query;
    }

    get uriFragment(): string | undefined {
        return this.uri.fragment;
    }

    async info(): Promise<DirectoryEntry> {
        throw new URIException(`URI ${this} does not support info()`);
    }

    async list(): Promise<DirectoryEntry[]> {
        throw new URIException(`URI ${this} does not support list()`);
    }

    async load(_recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support load()`);
    }

    async save(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support save()`);
    }

    async append(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support append()`);
    }

    async modify(_data: any, _sendCT?: ContentType | string, _recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support modify()`);
    }

    async remove(_recvCT?: ContentType | string): Promise<any> {
        throw new URIException(`URI ${this} does not support remove()`);
    }

    async query(..._args: any[]): Promise<any> {
        throw new URIException(`URI ${this} does not support query()`);
    }
}

class UnknownURI extends URI {}
