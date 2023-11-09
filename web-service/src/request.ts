import { BasicTypes, Params, SizeLimitedReadableStream } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { AuthSchemeRequest, FINALIZE, Finalizable, Parser, ParserError } from '@divine/uri';
import cuid from 'cuid';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { Http2ServerRequest, Http2Session } from 'http2';
import { Socket } from 'net';
import { TLSSocket } from 'tls';
import { UAParser } from 'ua-parser-js';
import { URL } from 'url';
import { WebError, WebStatus } from './error';
import { CONNECTION_CLOSING, WithConnectionClosing, decorateConsole } from './private/utils';
import { WebService, WebServiceConfig } from './service';

/** Information about the remote client that issued the {@link WebRequest}. */
export interface UserAgent {
    /** The full user agent string, taken from the `user-agent` HTTP request header. */
    ua?:     string;

    /** Name and version of the browser/user agent. */
    browser: { name?: string, version?: string, major?: string };

    /** The name and version of the HTML rendering engine. */
    engine:  { name?: string, version?: string };

    /** The name and version of the client operating system. */
    os:      { name?: string, version?: string };

    /** Information about the device the user agent is running on. */
    device:  { vendor?: string, model?: string, type?: 'console' | 'mobile' | 'tablet' | 'smarttv' | 'wearable' | 'embedded' };

    /** The CPU architecture the client is running on. */
    cpu:     { architecture?: '68k' | 'amd64' | 'arm' | 'arm64' | 'avr' | 'ia32' | 'ia64' | 'irix' | 'irix64' | 'mips' | 'mips64' | 'pa-risc' | 'ppc' | 'sparc' | 'spark64' };
}

const REQUEST_ID = /^[0-9A-Za-z+=/-]{1,200}$/;

/**
 * A wrapper around Node.js' [IncomingMessage](https://nodejs.org/api/http.html#class-httpincomingmessage).
 *
 * This class respects headers such as `x-forwarded-*` and `x-http-method-override` if configured to do so.
 */
export class WebRequest implements AuthSchemeRequest {
    /** The request method. */
    public readonly method: string;

    /** A reconstructed URL for this request */
    public readonly url: URL;

    /** When this request was created. */
    public readonly timestamp = Date.now();

    /** The IP address from which the request was issued. */
    public readonly remoteAddress: string;

    /** The parsed user agent */
    public readonly userAgent: UserAgent;

    /** The request ID. It's either generated or extracted from the incoming message, if
     * {@link WebServiceConfig.trustRequestID} is configured. */
    public readonly id: string;

    /** A per-request logger. Decorated with request ID if {@link WebServiceConfig.logRequestID} is `true`. */
    public readonly log: Console;

    /** Custom parameters from filters etc may be stored here. */
    public readonly params: Params = {}

    private _body?: Promise<any>;
    private _finalizers: Array<() => Promise<unknown>> = [];
    private _maxContentLength: number;

    /**
     * Parses the Node.js request based on configuration.
     *
     * @param webService      The WebService instance that received this request.
     * @param incomingMessage The wrapped Node.js incoming message.
     * @param config          WebService configuration specifiying how `incomingMessage` should be parsed.
     */
    constructor(public readonly webService: WebService<any>, public readonly incomingMessage: IncomingMessage | Http2ServerRequest, config: Required<WebServiceConfig>) {
        const incomingScheme = incomingMessage.socket instanceof TLSSocket ? 'https' : 'http';
        const incomingServer = incomingMessage.headers.host ?? `${incomingMessage.socket.localAddress}:${incomingMessage.socket.localPort}`;
        const incomingRemote = incomingMessage.socket.remoteAddress;
        const incomingMethod = incomingMessage.method;
        const incomingReqID  = config.trustRequestID && incomingMessage.headers[config.trustRequestID.toLowerCase()]?.toString();

        const scheme       = String((config.trustForwardedProto ? this.header('x-forwarded-proto',      '', false) : '') || incomingScheme);
        const server       = String((config.trustForwardedHost  ? this.header('x-forwarded-host',       '', false) : '') || incomingServer);
        this.remoteAddress = String((config.trustForwardedFor   ? this.header('x-forwarded-for',        '', false) : '') || incomingRemote);
        this.method        = String((config.trustMethodOverride ? this.header('x-http-method-override', '', false) : '') || incomingMethod);
        this.url           = new URL(`${scheme}://${server}${incomingMessage.url}`);
        this.userAgent     = new UAParser(incomingMessage.headers['user-agent']).getResult() as any;
        this.id            = incomingReqID && REQUEST_ID.test(incomingReqID) ? incomingReqID : cuid();
        this.log           = config.logRequestID ? decorateConsole(config.console, `#${this.id}`) : config.console;

        this._maxContentLength = config.maxContentLength;

        if (!this.userAgent.browser.name && this.userAgent.ua) {
            const match = /^(?<name>[^/]+)(?:\/(?<version>(?<major>[^.]+)[^/ ]*))?/.exec(this.userAgent.ua);

            if (match) {
                this.userAgent.browser = { ...match.groups };
            }
        }
    }

    /** A short description of the remote client, including agent name, version and remote address. */
    get remoteUserAgent(): string {
        return this.userAgent.browser.name && this.userAgent.browser.version ?
            `${this.userAgent.browser.name}/${this.userAgent.browser.version}@${this.remoteAddress}` :
            `Unknown@${this.remoteAddress}`;
    }

    /** All headers in a format compatible with the `AuthSchemeRequest` interface. */
    get headers(): Array<[string, string]> {
        return Object.entries(this.incomingMessage.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value!]);
    }

    /** `true` when the server is shutting down and waiting for connections to terminate. */
    get closing(): boolean {
        const stream: WithConnectionClosing<Socket | TLSSocket | Http2Session> | undefined = 'stream' in this.incomingMessage
            ? this.incomingMessage.stream.session
            : this.incomingMessage.socket;

        return stream && (stream[CONNECTION_CLOSING] === true || 'closed' in stream && stream.closed === true);
    }

    /** `true` when the server has been shut down and the request has been aborted. */
    get aborted(): boolean {
        return this.incomingMessage.aborted;
    }

    /**
     * Returns the value of a custom parameter (set by {@link setParam}).
     *
     * @param name The name of the parameter to fetch.
     * @param def  The default value to return, in case the parameter was not found. If not specified, an exception will
     *             be thrown instead.
     * @throws     {@link WebError}({@link WebStatus.INTERNAL_SERVER_ERROR}) if the requested header is missing and no
     *             default was provided.
     * @returns   The parameter value.
     */
    param(name: string, def?: BasicTypes): BasicTypes {
        let value = this.params[name];

        if (value === undefined) {
            if (def === undefined) {
                throw new WebError(WebStatus.INTERNAL_SERVER_ERROR, `Custom parameter '${name}' is missing`); // See also WebArguments
            }

            value = def;
        }

        return value;
    }

    /**
     * Returns the value of a request header.
     *
     * @param name         The name of the request header to fetch (case-insensitive).
     * @param def          The default value to return, in case the header was not found. If not specified, an exception
     *                     will be thrown instead.
     * @param concatenate  Specifies wheter to concatenate multiple headers with the same name into a single
     *                     comma-separated string or not. If `false`, only the first header will be returned.
     * @throws             {@link WebError}({@link WebStatus.BAD_REQUEST}) if the requested header is missing and no
     *                     default was provided.
     * @returns            The header value as a string.
     */
    header(name: keyof IncomingHttpHeaders, def?: string | string[], concatenate = true): string {
        let value = this.incomingMessage.headers[String(name).toLowerCase()];

        if (value === undefined || value instanceof Array && value[0] === undefined) {
            if (def === undefined) {
                throw new WebError(WebStatus.BAD_REQUEST, `Request header '${name}' is missing`); // See also WebArguments
            }

            value = def;
        }

        if (Array.isArray(value)) {
            return concatenate ? value.join(', ') : value[0];
        }
        else {
            return value;
        }
    }

    /**
     * Parses the incoming request body.
     *
     * A reference to the parsed message is kept and will be returned directly if this method is called multiple times.
     * The {@link close} method will free up temporary resources generated by this method, if any (for instance, file
     * objects from the `multipart/form-data` parser).
     *
     * @param contentType      What parser to use. Defaults to the `content-type` request header.
     * @param maxContentLength The maximum number of bytes to parse. Defaults to
     * {@link WebServiceConfig.maxContentLength}.
     * @throws                 {@link WebError}({@link WebStatus.PAYLOAD_TOO_LARGE}) if the request body was larger than
     *                         allowed.
     * @throws                 {@link WebError}({@link WebStatus.UNSUPPORTED_MEDIA_TYPE}) if the body could not be
     * parsed.
     * @returns                The parsed request entity.
     */
    async body<T extends object>(contentType?: ContentType | string, maxContentLength = this._maxContentLength): Promise<T> {
        try {
            if (!this._body) {
                const tooLarge = `Maximum payload size is ${maxContentLength} bytes`;

                if (Number(this.header('content-length', '-1')) > maxContentLength) {
                    throw new WebError(WebStatus.PAYLOAD_TOO_LARGE, tooLarge);
                }

                const limited = new SizeLimitedReadableStream(maxContentLength, () => new WebError(WebStatus.PAYLOAD_TOO_LARGE, tooLarge));
                const body = this._body = Parser.parse<T>(this.incomingMessage.pipe(limited), ContentType.create(contentType, this.header('content-type')));

                return this.addFinalizer(await body);
            }
            else {
                return await this._body;
            }
        }
        catch (err) {
            throw err instanceof WebError    ? err :
                  err instanceof ParserError ? new WebError(WebStatus.UNSUPPORTED_MEDIA_TYPE, err.message) :
                  err;
        }
    }

    /**
     * Sets a custom parameter. Useful for providing resources with custom properties from a {@link WebFilter}, for
     * instance.
     *
     * @param   param The name of the parameter to set.
     * @param   value The parameter value.
     * @returns This WebArguments.
     */
    setParam(param: string, value: BasicTypes): this {
        this.params[param] = value;
        return this;
    }

    /**
     * Registers a `Finalizable` object with this request.
     *
     * Finalizers are functions that will be invoked as part of the {@link close} method and are used to free up
     * temporary per-request resources.
     *
     * @param finalizable The `Finalizable` object whose finalizer should be called when this request is closed.
     * @returns           The object that was passed is returned as-is.
     */
    addFinalizer<T extends object>(finalizable: T & Finalizable): T {
        const finalize = finalizable[FINALIZE];

        if (finalize) {
            this._finalizers.push(finalize);
        }

        return finalizable;
    }

    /**
     * Closes this request and frees up all resources held by it by invoking all registered finalizers.
     */
    async close(): Promise<void> {
        // Run all finalizers, but do propagate first error
        await Promise.all(this._finalizers.map((finalize) => finalize()));
    }

    /** Returns a short description about this request, including request method, URL and content type. */
    toString(): string {
        const ct = this.incomingMessage.headers['content-type']?.replace(/;.*/, '');

        return `[${this.constructor.name}: ${this.method} ${this.url.href} ${ct ?? '-'}]`;
    }
}
