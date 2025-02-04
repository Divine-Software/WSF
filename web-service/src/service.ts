import { asError, escapeRegExp, isAsyncIterable, isReadableStream, StringParams } from '@divine/commons';
import { AuthSchemeError } from '@divine/uri';
import { IncomingMessage, ServerResponse } from 'http';
import { Http2ServerRequest, Http2ServerResponse } from 'http2';
import { pipeline } from 'stream';
import { WebError, WebStatus } from './error';
import { EventStreamResponse } from './helpers';
import { WebRequest } from './request';
import { WebArguments, WebErrorHandler, WebFilterCtor, WebResource, WebResourceCtor } from './resource';
import { WebResponse, WebResponses } from './response';
import { WebServer } from './server';

/** The WebService configuration properties. */
export interface WebServiceConfig {
    /** Where logs should be sent. Default is the global `console` object. */
    console?:              Console;

    /** The threshold, in milliseconds, for when a request will be considered "slow". Default is 1000 ms. */
    slowRequestThreshold?: number;

    /**
     * The name of the property holding the error message when a {@link WebError} is converted to a structued
     * {@link WebResponse}. Default is `message`.
     *
     * When an error is caught, it can be converted a JSON object with a single property holding the error message, and
     * the `errorMessageProperty` configuration specifies the name of that property.
     *
     * ```json
     * { "message": "No resource matches the path /foobar" }
     * ```
     */
    errorMessageProperty?: string;

    /** Specifies whether request IDs should be logged autmatically. Default is `true`. */
    logRequestID?:         boolean;

    /**
     * Specifies the default maximum payload size {@link WebRequest.body} should accept, unless an explicit limit is
     * proveded in the call. Default is 1,000,000 bytes.
     */
    maxContentLength?:     number;

    /** If not `null`, the request ID will be automatically be returned in this HTTP response header. Default is `null`. */
    returnRequestID?:      string | null;

    /** If `true`, incoming `x-forwarded-for` will be trusted and parsed. Default is `false`. */
    trustForwardedFor?:    boolean;

    /** If `true`, incoming `x-forwarded-host` will be trusted and parsed. Default is `false`. */
    trustForwardedHost?:   boolean;

    /** If `true`, incoming `x-forwarded-proto` will be trusted and parsed. Default is `false`. */
    trustForwardedProto?:  boolean;

    /** If `true`, incoming `x-http-method-override` will be trusted and parsed. Default is `false`. */
    trustMethodOverride?:  boolean;

    /**
     * If not `null`, the HTTP request header containing the request ID. Default is `null`, which means a new request ID
     * will be generated for each incoming request.
     */
    trustRequestID?:       string | null;
}

interface FilterDescriptor<Context> {
    filter: WebFilterCtor<Context>;
    pattern:  RegExp;
}

interface ResourceDescriptor<Context> {
    resource: WebResourceCtor<Context>;
    pattern:  string;
    groups:   number;
}

const ALLOWED_METHODS = /^(HEAD|GET|PUT|POST|PATCH|DELETE|OPTIONS)$/;

function getMethods(obj: any): string[] {
    return obj && typeof obj === 'object'
        ? Object.getOwnPropertyNames(obj).filter((method) => typeof obj[method] === 'function').concat(getMethods(Object.getPrototypeOf(obj)))
        : [];
}

function regExpParams(match: RegExpExecArray, offset: number, count: number, prefix: string) {
    const params: StringParams = {};

    for (let i = 1; i <= count; ++i) {
        params[i] = match[offset + i];
    }

    for (const param in match.groups) {
        if (param.startsWith(prefix)) {
            params[param.substr(prefix.length)] = match.groups[param];
        }
    }

    return params;
}
/**
 * A WebService is a collection of registered {@link WebResource | resources}, {@link WebFilter | filters} and an
 * optional {@link WebErrorHandler | error handler} that forms the web application.
 *
 * ## Concepts
 *
 * ### Context
 *
 * When a WebService is created, it can be associated with a custom object called the WebService *context*. This context
 * is passed to the resources and filters as they are constructed and can provide configuration and/or services to the
 * web application.
 *
 * ### Resources
 *
 * A {@link WebResource} is responsible for handling a specific location. It responds to one or more HTTP verbs and
 * produces a {@link WebResponse} once finished. A new instance of the resource class is constructed for each incoming
 * request, ensuring that no state is leaked between requests.
 *
 * Only a single resource will ever match an incoming request.
 *
 * ### Filters
 *
 * Filters are used to modify the behavior of a set of resources. They can be used to handle CORS requests,
 * authentication and authorization, throttling etc. Just like resources, a new instance of the filter will always be
 * constructed for each incoming request.
 *
 * Multiple filters may match an incoming request. They will be processed in the same order as they were added via
 * {@link addFilter} or {@link addFilters}.
 *
 * ### Error handler
 *
 * The error handler acts like a global `catch` block and can be used to produce non-generic error responses in case
 * something is not right.
 *
 * @template Context The type of the `context` property.
 */
export class WebService<Context> {
    /**
     * Utilitiy method to calculate an `Allow` header based on an {@link WebResource}.
     *
     * This method checks what methods are implemented on the provided object and generates a comma-separated list of
     * allowed HTTP methods.
     *
     * @param rsrc The resource to produce an `Allow` header for.
     * @returns    A comma-separated list of allowed HTTP methods.
     */
    public static makeAllowHeader(rsrc?: WebResource): string {
        const methods: string[] = [];

        for (const method of getMethods(rsrc)) {
            if (ALLOWED_METHODS.test(method)) {
                methods.push(method);
            }
        }

        if (methods.includes('GET') && !methods.includes('HEAD')) {
            methods.push('HEAD');
        }

        if (!methods.includes('OPTIONS')) {
            methods.push('OPTIONS');
        }

        return methods.sort().join(', ');
    }

    /** The actual {@link WebServiceConfig} used by this service. */
    public readonly webServiceConfig: Required<WebServiceConfig>;

    /** @returns The {@link WebServer} where this service is currently mounted, or `null`. */
    public get webServer(): WebServer | null {
        return this._webServer;
    }

    private _webServer: WebServer | null = null;
    private _mountPoint = '/';
    private _errorHandler?: WebErrorHandler<Context>;
    private _filters: Array<FilterDescriptor<Context>> = [];
    private _resources: Array<ResourceDescriptor<Context>> = [];
    private _resourcePattern?: RegExp;

    /**
     *
     * @param context The web service's *context*, which will be provided to filter and resource constructors.
     * @param config  The web service configuration.
     */
    constructor(public context: Context, config?: WebServiceConfig) {
        this.webServiceConfig = {
            console:              console,
            slowRequestThreshold: 1_000,
            maxContentLength:     1_000_000,
            errorMessageProperty: 'message',
            logRequestID:         true,
            returnRequestID:      null,
            trustForwardedFor:    false,
            trustForwardedHost:   false,
            trustForwardedProto:  false,
            trustMethodOverride:  false,
            trustRequestID:       null,
            ...config
        };
    }

    /** @returns The mount point where this service is mounted. Usually just '/'. */
    get webServiceMountPoint(): string {
        return this._mountPoint;
    }

    /**
     * Called by {@link WebServer.mount} when this WebService is mounted (attached to a WebServer).
     *
     * @param mountPoint The prefix path where this WebService should be mounted.
     * @param webServer  The WebServer this WebService should be mounted on.
     * @returns This WebService.
     */
    protected _mount(mountPoint: string, webServer: WebServer): this {
        if (!mountPoint.startsWith('/') || !mountPoint.endsWith('/')) {
            throw new TypeError(`Mount-point must both start and end with a slash; '${mountPoint}' does not`);
        } else if (this._webServer !== null) {
            throw new RangeError(`This WebService is already mounted on ${this.webServer}`);
        }

        this._webServer = webServer;
        this._mountPoint = mountPoint;
        this._resourcePattern = undefined;

        return this;
    }

    /**
     * Called by Called by {@link WebServer.unmount} when this WebService is unmounted.
     *
     * @param webServer  The WebServer this WebService is currently mounted on.
     * @returns This WebService.
     */
    protected _unmount(webServer: WebServer): this {
        if (webServer !== this._webServer) {
            throw new RangeError(`This WebService is mounted on ${this._webServer}, not ${webServer}`);
        }

        this._webServer = null;
        this._mountPoint = '/';
        this._resourcePattern = undefined;

        return this;
    }

    /**
     * Installs a service-wide error handler.
     *
     * Whenever a resource of filter throws an exception, the error handler is invoked to handle the error. The error
     * handler can either return a {@link WebResponse} or (re-)throw.
     *
     * @param errorHandler The error handler to install, or `undefined` to restore the default behaviour.
     * @returns THis WebService.
     */
    setErrorHandler(errorHandler: WebErrorHandler<Context> | undefined): this {
        this._errorHandler = errorHandler;

        return this;
    }

    /**
     * Registers a single {@link WebFilter | filter}.
     *
     * The filter's {@link WebFilterCtor.path | path} property defines what locations the filter is applicable to.
     *
     * @param filter A filter class to register.
     * @returns This WebService.
     */
    addFilter(filter: WebFilterCtor<Context>): this {
        this._validatePath('WebFilter', filter.path.source);

        this._filters.push({ filter, pattern: null! });
        this._resourcePattern = undefined;

        return this;
    }

    /**
     * Registers multiple {@link WebFilter | filters}.
     *
     * The filters' {@link WebFilterCtor.path | path} properties defines what locations each filter is applicable to.
     *
     * @param filters A sequence of filter classes to register.
     * @returns This WebService.
     */
    addFilters(filters: Iterable<WebFilterCtor<Context>>): this {
        for (const filter of filters) {
            this.addFilter(filter);
        }

        return this;
    }

    /**
     * Registers a single {@link WebResource | resource}.
     *
     * The resource's {@link WebResourceCtor.path | path} property defines what locations the resource is applicable to.
     *
     * @param resource A resource class to register.
     * @returns This WebService.
     */
    addResource(resource: WebResourceCtor<Context>): this {
        const offset  = this._resources.length ? this._resources.length + this._resources[this._resources.length - 1].groups : 1;
        const source  = resource.path.source;
        const match   = RegExp('|' + source).exec('')!;
        const groups  = match.length - 1;
        const pattern = source.replace(/(^|[^\\])(\\\\)*\(\?<([a-zA-Z0-9_]+)>/g, `$1$2(?<_${offset}_$3>`);

        this._validatePath('WebResource', source);

        this._resources[offset] = { resource, groups, pattern };
        this._resourcePattern = undefined;

        return this;
    }

    /**
     * Registers multiple {@link WebResource | resources}.
     *
     * The resources' {@link WebResourceCtor.path | path} properties defines what locations each resource is applicable
     * to.
     *
     * @param resources A sequence of resource classes to register.
     * @returns This WebService.
     */
    addResources(resources: Iterable<WebResourceCtor<Context>>): this {
        for (const resource of resources) {
            this.addResource(resource);
        }

        return this;
    }

    /**
     * Returns a Node.jss HTTP request handler as specified by
     * [createServer](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener).
     *
     * The request handler will construct a {@link WebRequest} and then invoke {@link dispatchRequest}. The response
     * will then be serialized and sent to the client.
     *
     * @returns A Node.js HTTP request handler for this WebService.
     */
    requestEventHandler(): (req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse) => Promise<void> {
        return async (req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse) => {
            try {
                const webreq = new WebRequest(this, req, this.webServiceConfig);
                webreq.log.info(`Begin ${webreq} from ${webreq.remoteUserAgent}`);

                const webres = await this.dispatchRequest(webreq);

                try {
                    if (webres.timestamp - webreq.timestamp > this.webServiceConfig.slowRequestThreshold) {
                        webreq.log.warn(`Slow: ${webreq} from ${webreq.remoteUserAgent} <${webres.timestamp - webreq.timestamp} ms>`);
                    }

                    const rawres = await webres.serialize(webreq, this.webServiceConfig);

                    if ('stream' in res) { // HTTP/2
                        for (const forbidden of [ "connection", "keep-alive", "proxy-connection", "transfer-encoding",  "upgrade" ]) {
                            delete rawres.headers[forbidden];
                        }
                    }

                    res.writeHead(rawres.status, rawres.headers);

                    if (isReadableStream(rawres.body)) {
                        (res as ServerResponse).flushHeaders?.();
                        webreq.log.info(`Send ${webres} to ${webreq.remoteUserAgent} <${webres.timestamp - webreq.timestamp} ms>`);
                    }

                    await new Promise<void>((resolve, reject) => {
                        if (rawres.body instanceof Buffer) {
                            (res as ServerResponse).write(rawres.body, (err) => err ? reject(err) : resolve());
                        }
                        else if (rawres.body) {
                            pipeline(rawres.body, res, (err) => err ? reject(err) : resolve());
                        }
                        else {
                            resolve();
                        }
                    });

                    webreq.log.info(`Sent ${webres} to ${webreq.remoteUserAgent} <${webres.timestamp - webreq.timestamp}+${Date.now() - webres.timestamp} ms>`);
                }
                catch (err) {
                    webreq.log.warn(`${webres} could not be sent to ${webreq.remoteUserAgent}: ${err}`);
                }
                finally {
                    await webres.close();
                }
            }
            catch (err) {
                this.webServiceConfig.console.error(`Unexpected error in requestEventHandler`, err);
            }
            finally {
                res.end();
            }
        };
    }

    /**
     * Dispatches a request to the intended {@link WebResource | resource} and also applies all matching {@link
     * WebFilter | filters}.
     *
     * Errors will also be handled, so this method does not normally throw.
     *
     * @param webreq The HTTP request to handle.
     * @returns An HTTP response to be sent to the client.
     */
    async dispatchRequest(webreq: WebRequest): Promise<WebResponse> {
        try {
            // Compile merged pattern
            if (!this._resourcePattern) {
                this._filters.forEach((filter) => { filter.pattern = RegExp(`^${escapeRegExp(this._mountPoint)}${filter.filter.path.source}`); });
                this._resourcePattern = RegExp(`^${escapeRegExp(this._mountPoint)}(?:${this._resources.filter((r) => !!r).map((r) => `(${r.pattern})`).join('|')})$`);
            }

            // Match incoming request
            const match = this._resourcePattern.exec(webreq.url.pathname);

            if (match) {
                // Find resource that matched
                // eslint-disable-next-line @typescript-eslint/no-for-in-array
                for (const r in this._resources) {
                    if (match[r] !== undefined) {
                        return await this._handleResource(webreq, this._resources[r], Number(r), match);
                    }
                }
            }

            const resourceNotFound = async () => {
                throw new WebError(WebStatus.NOT_FOUND, `No resource matches the path ${webreq.url.pathname}`);
            };

            return await this._handleFilters(webreq, resourceNotFound, resourceNotFound);
        }
        catch (err) {
            return await this._handleException(err, webreq);
        }
        finally {
            await webreq.close();
        }
    }

    private async _handleError(_err: Error | unknown, errorHandler?: WebErrorHandler<Context> | ((err: Error, context: Context) => void)) {
        const err = asError(_err);
        const handled = await errorHandler?.(err, this.context);

        if (handled) {
            return handled;
        }
        else {
            throw err;
        }
    }

    private async _handleException(err: unknown, webreq: WebRequest): Promise<WebResponse> {
        const messageProp = this.webServiceConfig.errorMessageProperty;

        webreq.log.warn(`Failed: ${err}`);

        if (err instanceof WebError) {
            return err.toWebResponse(messageProp);
        }
        else if (err instanceof AuthSchemeError) {
            return new WebResponse(WebStatus.UNAUTHORIZED, { [messageProp]: err.message }, {
                'www-authenticate': err.challenge,
            });
        }
        else {
            webreq.log.debug(err);
            return new WebResponse(WebStatus.INTERNAL_SERVER_ERROR, { [messageProp]: 'Unexpected WebService/WebResource error' });
        }
    }

    private async _handleFilters(webreq: WebRequest, resource: () => Promise<WebResource>, resourceHandler: () => Promise<WebResponses>): Promise<WebResponse> {
        const matches = this._filters.map((desc) => ({ ctor: desc.filter, match: desc.pattern.exec(webreq.url.pathname)! })).filter((desc) => desc.match);
        const nextflt = async (): Promise<WebResponse> => {
            try {
                const active = matches.shift();
                const params = active && new WebArguments(regExpParams(active.match, 0, active.match.length, ''), webreq);
                const result = active
                    ? await new active.ctor(this.context, params!).filter(nextflt, params!, resource)
                    : await resourceHandler();

                if (result instanceof WebResponse) {
                    return result;
                } else if (isAsyncIterable(result) && !isReadableStream(result)) {
                    return new EventStreamResponse(result, undefined, undefined, undefined, {
                        get aborted() { return webreq.closing || webreq.aborted; },
                    });
                } else {
                    return new WebResponse(result !== null ? WebStatus.OK : WebStatus.NO_CONTENT, result);
                }
            }
            catch (err) {
                try {
                    return await this._handleError(err, this._errorHandler);
                }
                catch (err) {
                    return this._handleException(err, webreq);
                }
            }
        };

        return nextflt();
    }

    private async _handleResource(webreq: WebRequest, desc: ResourceDescriptor<Context>, offset: number, match: RegExpExecArray): Promise<WebResponse> {
        let args: WebArguments | undefined;
        let rsrc: WebResource | undefined;

        const createResource = async () => {
            if (!rsrc) {
                args = new WebArguments(regExpParams(match, offset, desc.groups, `_${offset}_`), webreq);
                rsrc = new desc.resource(this.context, args);
                await rsrc.init?.(args);
            }

            return rsrc;
        };

        return this._handleFilters(webreq, createResource, async () => {
            try {
                rsrc = await createResource();

                let method = ALLOWED_METHODS.test(webreq.method) ? (rsrc as any)[webreq.method] as typeof rsrc.default : undefined;

                if (!method && webreq.method === 'HEAD') {
                    // eslint-disable-next-line @typescript-eslint/unbound-method
                    method = rsrc.GET;
                }

                // eslint-disable-next-line @typescript-eslint/unbound-method
                method = method || rsrc.default;

                if (method) {
                    return await method.call(rsrc, args!);
                }
                else if (webreq.method === 'OPTIONS') {
                    return new WebResponse(WebStatus.OK, null, {
                        allow: WebService.makeAllowHeader(rsrc)
                    });
                }
                else {
                    throw new WebError(WebStatus.METHOD_NOT_ALLOWED, `This resource does not handle ${webreq.method} requests`, {
                        allow: WebService.makeAllowHeader(rsrc)
                    });
                }
            }
            catch (err) {
                return await this._handleError(err, (err) => rsrc?.catch?.(err));
            }
            finally {
                await rsrc?.close?.();
            }
        });
    }

    private _validatePath(cls: string, source: string): void {
        if (source.startsWith('^') || source.endsWith('$')) {
            throw new TypeError(`${cls}.path should not include the start-of-line token ^ or the end-of-line token $`);
        }

        if (source.startsWith('\\/')) {
            throw new TypeError(`${cls}.path should not include leading slashes`);
        }
    }
}
