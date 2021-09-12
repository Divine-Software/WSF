import { KVPairs } from '@divine/headers';
import { AuthSchemeError } from '@divine/uri';
import { IncomingMessage, ServerResponse } from 'http';
import { pipeline } from 'stream';
import { WebError, WebStatus } from './error';
import { WebRequest } from './request';
import { WebArguments, WebErrorHandler, WebFilterCtor, WebResource, WebResourceCtor } from './resource';
import { WebResponse, WebResponses } from './response';
import { isReadableStream } from './private/utils';

export interface WebServiceConfig {
    console?:              Console;
    errorMessageProperty?: string;
    logRequestID?:         boolean;
    maxContentLength?:     number;
    returnRequestID?:      string | null;
    trustForwardedFor?:    boolean;
    trustForwardedHost?:   boolean;
    trustForwardedProto?:  boolean;
    trustMethodOverride?:  boolean;
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
    const params: KVPairs = {};

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

export class WebService<Context> {
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

    public webServiceConfig: Required<WebServiceConfig>;

    private _mountPoint = '/';
    private _errorHandler?: WebErrorHandler<Context>;
    private _filters: Array<FilterDescriptor<Context>> = [];
    private _resources: Array<ResourceDescriptor<Context>> = [];
    private _resourcePattern?: RegExp;

    constructor(public context: Context, config?: WebServiceConfig) {
        this.webServiceConfig = {
            console:              console,
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

    get webServiceMountPoint(): string {
        return this._mountPoint;
    }

    mount(mountPoint: string): this {
        if (!mountPoint.startsWith('/') || !mountPoint.endsWith('/')) {
            throw new TypeError(`Mount-point must both start and end with a slash; '${mountPoint}' does not`);
        }

        this._mountPoint = mountPoint;
        this._resourcePattern = undefined;

        return this;
    }

    unmount(): this {
        this._mountPoint = '/';
        this._resourcePattern = undefined;

        return this;
    }

    setErrorHandler(errorHandler: WebErrorHandler<Context> | undefined): this {
        this._errorHandler = errorHandler;

        return this;
    }

    addFilter(filter: WebFilterCtor<Context>): this {
        this._validatePath('WebFilter', filter.path.source);

        this._filters.push({ filter, pattern: null! });
        this._resourcePattern = undefined;

        return this;
    }

    addFilters(filters: Iterable<WebFilterCtor<Context>>): this {
        for (const filter of filters) {
            this.addFilter(filter);
        }

        return this;
    }

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

    addResources(resources: Iterable<WebResourceCtor<Context>>): this {
        for (const resource of resources) {
            this.addResource(resource);
        }

        return this;
    }

    requestEventHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
        return async (req: IncomingMessage, res: ServerResponse) => {
            try {
                const webreq = new WebRequest(req, this.webServiceConfig);

                webreq.log.info(`Rec'd ${webreq} from ${webreq.remoteUserAgent}`);

                const webres = await this.dispatchRequest(webreq);

                try {
                    const rawres = await webres.serialize(webreq, this.webServiceConfig);

                    res.writeHead(rawres.status, rawres.headers);

                    if (isReadableStream(rawres.body)) {
                        res.flushHeaders();
                        webreq.log.info(`Send ${webres} to ${webreq.remoteUserAgent}`);
                    }

                    await new Promise<void>((resolve, reject) => {
                        if (rawres.body instanceof Buffer) {
                            res.write(rawres.body, (err) => err ? reject(err) : resolve());
                        }
                        else if (rawres.body) {
                            pipeline(rawres.body, res, (err) => err ? reject(err) : resolve());
                        }
                        else {
                            resolve();
                        }
                    });

                    webreq.log.info(`Sent ${webres} to ${webreq.remoteUserAgent}`);
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

    async dispatchRequest(webreq: WebRequest): Promise<WebResponse> {
        try {
            // Compile merged pattern
            if (!this._resourcePattern) {
                this._filters.forEach((filter) => { filter.pattern = RegExp(`^${this._mountPoint}${filter.filter.path.source}`); });
                this._resourcePattern = RegExp(`^${this._mountPoint}(?:${this._resources.filter((r) => !!r).map((r) => `(${r.pattern})`).join('|')})$`);
            }

            // Match incoming request
            const match = this._resourcePattern.exec(webreq.url.pathname);

            if (match) {
                // Find resource that matched
                for (const r in this._resources) {
                    if (match[r] !== undefined) {
                        return this._handleResource(webreq, this._resources[r], Number(r), match);
                    }
                }
            }

            const resourceNotFound = async () => {
                throw new WebError(WebStatus.NOT_FOUND, `No resource matches the path ${webreq.url.pathname}`);
            };

            return this._handleFilters(webreq, resourceNotFound, resourceNotFound);
        }
        catch (err) {
            return await this._handleException(err, webreq);
        }
        finally {
            await webreq.close();
        }
    }

    private async _handleError(err: Error, errorHandler?: WebErrorHandler<Context> | ((err: Error, context: Context) => void)) {
        const handled = await errorHandler?.(err, this.context);

        if (handled) {
            return handled;
        }
        else {
            throw err;
        }
    }

    private async _handleException(err: Error, webreq: WebRequest): Promise<WebResponse> {
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

                return result instanceof WebResponse ? result : new WebResponse(result ? WebStatus.OK : WebStatus.NO_CONTENT, result);
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
                    method = rsrc.GET;
                }

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
                return this._handleError(err, (err) => rsrc?.catch?.(err));
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
