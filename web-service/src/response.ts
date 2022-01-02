import { isReadableStream } from '@divine/commons';
import { ContentDisposition, ContentType, WWWAuthenticate } from '@divine/headers';
import { Parser } from '@divine/uri';
import { Readable } from 'stream';
import { URL } from 'url';
import { WebError, WebStatus } from './error';
import { WebRequest } from './request';
import { WebServiceConfig } from './service';

/** @internal */
export interface RawResponse {
    status:  number;
    headers: { [name: string]: string | string[] };
    body:    Buffer | NodeJS.ReadableStream | null;
}

/**
 * An HTTP response that is to be transmitted back to the client.
 */
export class WebResponse {
    /** The response body. */
    public body: Buffer | NodeJS.ReadableStream | null;

    /**
     * Constructs a new response object.
     *
     * The body is currently serialized in the constructor according to the `content-type` header, but that **will**
     * change in the future when `accept` content negotiation is added, so do not depend on that.
     *
     * @param status  The HTTP status code to return.
     * @param body    The HTTP response entity to return.
     * @param headers The HTTP headers to return. If the length of the response body is known, `content-length` will be
     *                added automatically.
     */
    constructor(public status: WebStatus, body?: null | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object, public headers: WebResponseHeaders = {}) {
        const defaultCT = (ct: ContentType) => this.headers['content-type'] ??= ct;

        if (body === undefined || body === null) {
            this.body = null;
        }
        else if (body instanceof Buffer || isReadableStream(body)) {
            defaultCT(ContentType.bytes);
            this.body = body;
        }
        else if (typeof body === 'string' || typeof body === 'number' || typeof body === 'bigint' || typeof body === 'boolean' || body instanceof Date) {
            defaultCT(ContentType.text);
            this.body = Buffer.from(body instanceof Date ? body.toISOString() : body.toString());
        }
        else {
            try {
                const [serializied, ct] = Parser.serialize(body, this.headers['content-type']);

                this.headers['content-type'] = ct; // Force parser-provided content-type (see MultiPartParser.serialize())
                this.body = serializied instanceof Buffer ? serializied : Readable.from(serializied);
            }
            catch (err) {
                throw new WebError(WebStatus.INTERNAL_SERVER_ERROR, String(err));
            }
        }

        if (this.body instanceof Buffer) {
            this.headers['content-length'] = this.body.length;
        }
    }

    /**
     * Adds a custom header to the list of headers to return.
     *
     * @param name  The name of the header to return (case-insensitive).
     * @param value The header value.
     * @returns     This WebResponse.
     */
    setHeader(name: keyof WebResponseHeaders | string, value: string | number | boolean | string[] | undefined): this {
        (this.headers as any)[name.toLowerCase()] = value;

        return this;
    }

    /** Closes the response by destroying the body, in case it is a readable stream. */
    async close(): Promise<void> {
        if (this.body instanceof Readable) {
            this.body.destroy();
        }
    }

    /**
     * Serializes the response.
     *
     * For successful `GET` and `HEAD` responses, if an `etag` response header matches the `if-none-match` request
     * header, [[WebStatus.NOT_MODIFIED]] will be returned instead.
     *
     * If [[WebServiceConfig.returnRequestID]] is configured, the request ID will also be automatically added to the
     * response.
     *
     * @param webreq The request this is a response to.
     * @param config The WebService configuration.
     * @returns      A serialized response.
     */
    async serialize(webreq: WebRequest, config: Required<WebServiceConfig>): Promise<RawResponse> {
        const response: RawResponse = {
            status:    this.status,
            headers:   {},
            body:      this.body,
        };

        for (const [key, value] of Object.entries(this.headers)) {
            if (Array.isArray(value)) {
                response.headers[key] = value.map((v) => String(v));
            }
            else if (value !== undefined) {
                response.headers[key] = String(value);
            }
        }

        if (response.status === WebStatus.OK && /^(HEAD|GET)$/.test(webreq.method) &&
            response.headers['etag'] && response.headers['etag'] === webreq.header('if-none-match', '')) {
            response.status = WebStatus.NOT_MODIFIED;
            response.body   = null;
        }

        if (webreq.method === 'HEAD') {
            response.body = null;
        }

        if (config.returnRequestID && response.headers[config.returnRequestID] === undefined) {
            response.headers[config.returnRequestID] = webreq.id;
        }

        return response;
    }

    /** Returns a short description about this response, including status and content type. */
    toString(): string {
        const ct = this.headers['content-type']?.toString().replace(/;.*/, '');

        return `[WebResponse: ${this.status} ${WebStatus[this.status] || this.status} ${ct ?? '-'}]`;
    }
}

/** Definitions of all known HTTP response headers. */
export interface WebResponseHeaders {
    /** Specifies which patch document formats this server supports. */
    'accept-patch'?:                     string | ContentType;

    /** What partial content range types this server supports via byte serving. */
    'accept-ranges'?:                    string;

    /** CORS: Indicates whether the response can be shared when request's credentials mode is "include". */
    'access-control-allow-credentials'?: string | boolean;

    /** CORS: Indicates which headers are supported by the response's URL. */
    'access-control-allow-headers'?:     string | string[];

    /** CORS: Indicates which methods are supported by the response's URL. */
    'access-control-allow-methods'?:     string | string[];

    /** CORS: Indicates whether the response can be shared, via returning the literal value of the `Origin` request header (which can be `null`) or `*` in a response. */
    'access-control-allow-origin'?:      string | URL;

    /** CORS: Indicates which headers can be exposed as part of the response by listing their names. */
    'access-control-expose-headers'?:    string | string[];

    /** CORS: Indicates the number of seconds (5 by default) the information provided by the `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` headers can be cached. */
    'access-control-max-age'?:           string | number;

    /** The age the object has been in a proxy cache in seconds. */
    'age'?:                              string | number;

    /** Valid methods for a specified resource. */
    'allow'?:                            string | string[];

    /** A server uses "Alt-Svc" header (meaning Alternative Services) to indicate that its resources can also be accessed at a different network location (host or port) or using a different protocol. */
    'alt-svc'?:                          string;

    /** Tells all caching mechanisms from server to client whether they may cache this object. */
    'cache-control'?:                    string;

    /** Control options for the current connection and list of hop-by-hop response fields. */
    'connection'?:                       string;

    /** An opportunity to raise a "File Download" dialogue box for a known MIME type with binary format or suggest a filename for dynamic content. */
    'content-disposition'?:              string | ContentDisposition;

    /** The type of encoding used on the data. */
    'content-encoding'?:                 string | string[];

    /** The natural language or languages of the intended audience for the enclosed content. */
    'content-language'?:                 string;

    /** The length of the response body in octets. */
    'content-length'?:                   string | number;

    /** An alternate location for the returned data. */
    'content-location'?:                 string | URL;

    /** A Base64-encoded binary MD5 sum of the content of the response. */
    'content-md5'?:                      string;

    /** Where in a full body message this partial message belongs. */
    'content-range'?:                    string;

    /** Content Security Policy definition. */
    'content-security-policy'?:          string;

    /** The MIME type of this content. */
    'content-type'?:                     string | ContentType;

    /** The date and time that the message was sent. */
    'date'?:                             string | Date;

    /** Specifies the delta-encoding entity tag of the response. */
    'delta-base'?:                       string;

    /** An identifier for a specific version of a resource, often a message digest. */
    'etag'?:                             string;

    /** Gives the date/time after which the response is considered stale. */
    'expires'?:                          string | Date;

    /** Notify to prefer to enforce Certificate Transparency. */
    'expect-ct'?:                        string;

    /** Instance-manipulations applied to the response. */
    'im'?:                               string;

    /** The last modified date for the requested object. */
    'last-modified'?:                    string | Date;

    /** Used to express a typed relationship with another resource. */
    'link'?:                             string;

    /** Used in redirection, or when a new resource has been created. */
    'location'?:                         string | URL;

    /** Used to configure network request logging. */
    'nel'?:                              string;

    /** This field is supposed to set P3P policy. */
    'p3p'?:                              string;

    /** Implementation-specific fields that may have various effects anywhere along the request-response chain. */
    'pragma'?:                           string;

    /** To allow or disable different features or APIs of the browser. */
    'permissions-policy'?:               string;

    /** Indicates which Prefer tokens were honored by the server and applied to the processing of the request. */
    'preference-applied'?:               string;

    /** Request authentication to access the proxy. */
    'proxy-authenticate'?:               string | WWWAuthenticate | WWWAuthenticate[];

    /** HTTP Public Key Pinning, announces hash of website's authentic TLS certificate. */
    'public-key-pins'?:                  string;

    /** Used in redirection, or when a new resource has been created. */
    'refresh'?:                          string | number | Date;

    /** Instructs the user agent to store reporting endpoints for an origin. */
    'report-to'?:                        string;

    /** If an entity is temporarily unavailable, this instructs the client to try again later. */
    'retry-after'?:                      string | number | Date;

    /** A name for the server. */
    'server'?:                           string;

    /** An HTTP cookie. */
    'set-cookie'?:                       string;

    /** A HSTS Policy informing the HTTP client how long to cache the HTTPS only policy and whether this applies to subdomains. */
    'strict-transport-security'?:        string;

    /** The Timing-Allow-Origin response header specifies origins that are allowed to see values of attributes retrieved via features of the Resource Timing API, which would otherwise be reported as zero due to cross-origin restrictions. */
    'timing-allow-origin'?:              string | string[];

    /** Tracking Status header, value suggested to be sent in response to a DNT(do-not-track). */
    'tk'?:                               string;

    /** The Trailer general field value indicates that the given set of header fields is present in the trailer of a message encoded with chunked transfer coding. */
    'trailer'?:                          string | string[];

    /** The form of encoding used to safely transfer the entity to the user. */
    'transfer-encoding'?:                string | string[];

    /** Ask the client to upgrade to another protocol. */
    'upgrade'?:                          string | string[];

    /** Tells downstream proxies how to match future request headers to decide whether the cached response can be used rather than requesting a fresh one from the origin server. */
    'vary'?:                             string | string[];

    /** Informs the client of proxies through which the response was sent. */
    'via'?:                              string | string[];

    /** A general warning about possible problems with the entity body. */
    'warning'?:                          string;

    /** Indicates the authentication scheme that should be used to access the requested entity. */
    'www-authenticate'?:                 string | WWWAuthenticate | WWWAuthenticate[];

    /** Provide the duration of the audio or video in seconds; only supported by Gecko browsers. */
    'x-content-duration'?:               string | number;

    /** Content Security Policy definition. */
    'x-content-security-policy'?:        string;

    /** The only defined value, "nosniff", prevents Internet Explorer from MIME-sniffing a response away from the declared content-type. */
    'x-content-type-options'?:           string;

    /** Correlates HTTP requests between a client and server. */
    'x-correlation-id'?:                 string;

    /** Clickjacking protection. */
    'x-frame-options'?:                  string;

    /** Specifies the technology (e.g. ASP.NET, PHP, JBoss) supporting the web application. */
    'x-powered-by'?:                     string;

    /** Specifies the component that is responsible for a particular redirect. */
    'x-redirect-by'?:                    string;

    /** Correlates HTTP requests between a client and server. */
    'x-request-id'?:                     string;

    /** Recommends the preferred rendering engine (often a backward-compatibility mode) to use to display the content. */
    'x-ua-compatible'?:                  string;

    /** Content Security Policy definition. */
    'x-webkit-csp'?:                     string;

    /** Cross-site scripting (XSS) filter. */
    'x-xss-protection'?:                 string;
}

/** A union of all types a [[WebResource]] method may return. */
export type WebResponses = null | WebResponse | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object;
