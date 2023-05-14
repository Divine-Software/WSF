import { StringParams } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { WebError, WebStatus } from './error';
import { WebRequest } from './request';
import { WebResponse, WebResponses } from './response';

/**
 * A custom error handler.
 *
 * @template Context The type of the WebService context.
 * @param err        The error that caused the handler to be invoked.
 * @param context    The WebService context.
 * @returns A response that should be sent back to the client.
 */
export type WebErrorHandler<Context> = (err: Error, context: Context) => Promise<WebResponse>;

/**
 * The static side of a web filter.
 *
 * Specifies how a filter is constructed and configures for what paths the filter applies to.
 *
 * @template Context The type of the WebService context.
 */
export interface WebFilterCtor<Context> {
    /** A regular expression that is used when checking if this filter should process a given request. */
    path: RegExp;

    /**
     * Constructs a filter instance. Invoked by {@link WebService} when a filter's path matches the request path.
     *
     * @param context The WebService context.
     * @param args    The request arguments.
     * @returns       A new {@link WebFilter} instance.
     */
    new(context: Context, args: WebArguments): WebFilter;
}

/**
 * The instance side of a web filter.
 *
 * Filters are used to modify or enhance the behaviour of resources.
 */
export interface WebFilter {
    /**
     * Invoked by {@link WebService} when the filter should process a request or response.
     *
     * The filter may act on the request before or after a resource handles the request (or both). Call the `next`
     * function to process the request normally and receive the default response. It's also possible to get a reference
     * to the actual resource instance by calling the `resource` function. Note that this function may throw a
     * {@link WebError} in case no resource matched the request.
     *
     * The filter is free to modify the request, the resource instance and/or the response as part of its work.
     *
     * @param next      A function that evaluates the request and returns the default response.
     * @param args      The request arguments.
     * @param resource  A function that returns the resource that this request matched.
     */
    filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>): Promise<WebResponses>;
}

/**
 * An optional, trivial base class for filters, which simply stores a reference to the context and request arguments.
 *
 * @template Context The type of the WebService context.
 */
export abstract class WebFilterBase<Context> implements WebFilter {
    /**
     * Constructs a resource or filter instance.
     *
     * @param _context The WebService context.
     * @param _args    The request arguments.
     */
    constructor(protected _context: Context, protected _args: WebArguments) {
        // All done
    }

    abstract filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>): Promise<WebResponses>;
}

/**
 * The static side of a web resource.
 *
 * Specifies how a resource is constructed and configures for what paths the resource applies to.
 *
 * @template Context The type of the WebService context.
 */
export interface WebResourceCtor<Context> {
    /** A regular expression that is used when checking if this filter should process a given request. */
    path: RegExp;

    /**
     * Constructs a resource instance. Invoked by {@link WebService} when a resource's path matches the request path.
     *
     * @param context The WebService context.
     * @param args    The request arguments.
     * @returns       A new {@link WebResource} instance.
     */
    new(context: Context, args: WebArguments): WebResource;
}

/**
 * The instance side of a web resource.
 *
 * Resources are objects that produces results based on the HTTP request method. All methods in this interface are
 * optional. You should implement the methods that are applicable to your resource.
 */
export interface WebResource {
    /**
     * Initializes the resource object. This method acts like an asynchronous constructor.
     *
     * @param args The request arguments.
     */
    init    ?(args: WebArguments): Promise<void>;

    /**
     * Invoked when the request has been fully processed. Useful for clean-up tasks.
     */
    close   ?(): Promise<void>;

    /**
     * Invoked when the client issues a `HEAD` request.
     *
     * If this method is not implemented, {@link WebService} will fall back to the {@link GET} method.
     *
     * @param args The request arguments.
     * @returns The response. The response body will be discarded, but all other parts of the response applies.
     */
    HEAD    ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `GET` request.
     *
     * This method may also be invoked for `HEAD` requests, if {@link HEAD} is not implemented.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    GET     ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `PUT` request.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    PUT     ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `POST` request.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    POST    ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `PATCH` request.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    PATCH   ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `DELETE` request.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    DELETE  ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues a `OPTIONS` request.
     *
     * If this method is not implemented, {@link WebService} will use {@link WebService.makeAllowHeader} to construct a
     * suitable response for the request.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    OPTIONS ?(args: WebArguments): Promise<WebResponses>;

    /**
     * Invoked when the client issues any request that was not handled by {@link HEAD}, {@link GET}, {@link PUT},
     * {@link POST}, {@link PATCH}, {@link DELETE} or {@link OPTIONS}.
     *
     * Can be used to handle multiple verbs with the same code or to handle custom verbs not defined by this interface.
     * Note that automatic `OPTIONS` handling will not work as desired when this method is used, since there is no way
     * for {@link WebService} to figure out what methods are supported.
     *
     * @param args The request arguments.
     * @returns The response; a {@link WebResponse} object or just the response payload from which a successful
     * WebResponse will be constructed.
     */
    default ?(args: WebArguments): Promise<WebResponses>;

    /**
     * A resource-specific error handler. Will be invoked whenever one of the other methods (expcect {@link close})
     * throws an exception.
     *
     * @param err
     */
    catch   ?(err: Error): WebResponse | Promise<WebResponse>;
}

/**
 * An optional, trivial base class for resources, which simply stores a reference to the context and request arguments.
 *
 * @template Context The type of the WebService context.
 */
export abstract class WebResourceBase<Context> implements WebResource {
    /**
     * Constructs a resource or filter instance.
     *
     * @param _context The WebService context.
     * @param _args    The request arguments.
     */
    constructor(protected _context: Context, protected _args: WebArguments) {
        // All done
    }

    async close(): Promise<void> {
        // This method is just here to silence ts(2559): Type 'WebResourceBase<Context>' has no properties in common
        // with type 'WebResource'.
    }
}

/**
 * A unified view all all possible arguments a filter or resource may receive when invoked.
 *
 * Arguments may come from RegExp groups in the resource/filter path, query parameters, request headers and the parsed
 * request body.
 */
export class WebArguments {
    /**
     * A readonly map of all arguments with their unparsed values.
     *
     * Since arguments may come from different sources, they are prefixed as follows:
     *
     * * RegExp group parameters (matched from the URL path) have a `$` prefix.
     * * URL query parameters have a `?` prefix.
     * * Request headers have a `@` prefix.
     * * Parameters from the request body have a `.` prefix. Note that these are only inserted once {@link body} has
     *   been called.
     * * Custom request parameters manually set by {@link WebRequest.setParam} have a `~` prefix.
     *
     */
    public readonly params: { [key: string]: string | object | undefined };

    /**
     * Constructs a new WebArguments instance.
     *
     * @param params   The RegExp groups from the path matcher.
     * @param request  The request this class wraps.
     */
    constructor(params: StringParams, public readonly request: WebRequest) {
        const urlargs = Object.entries(params);
        const headers = request.headers;
        const qparams = [...request.url.searchParams.entries()];
        const rparams = Object.entries(request.params);

        this.params = Object.fromEntries([
            ...urlargs.map(([k, v]) => ['$' + k, v]),
            ...headers.map(([k, v]) => ['@' + k, v]),
            ...qparams.map(([k, v]) => ['?' + k, v]),
            ...rparams.map(([k, v]) => ['~' + k, typeof v === 'object' ? v : String(v)]),
        ]);
    }

    /** An alias/shortcut for {@link WebRequest.log}, which in turn is based on {@link WebServiceConfig.console}. */
    get log(): Console {
        return this.request.log;
    }

    /**
     * Invokes {@link WebRequest.body} and then inserts all top-level properties of the parsed body into {@link params}
     * with a `.` prefix (unless the parsed body is an array).
     *
     * @template T             The type this method should return.
     * @param contentType      What parser to use. Defaults to the `content-type` request header.
     * @param maxContentLength The maximum number of bytes to parse. Defaults to
     * {@link WebServiceConfig.maxContentLength}.
     * @throws                 {@link WebError}({@link WebStatus.PAYLOAD_TOO_LARGE}) if the request body was larger than
     * allowed.
     * @throws                 {@link WebError}({@link WebStatus.UNSUPPORTED_MEDIA_TYPE}) if the body could not be
     * parsed.
     * @returns                The parsed request entity.
     */
    async body<T extends object>(contentType?: ContentType | string, maxContentLength?: number): Promise<T> {
        const body = await this.request.body<T>(contentType, maxContentLength);

        if (!Array.isArray(body)) {
            for (const [k, v] of Object.entries(body)) {
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    this.params['.' + k] = String(v);
                }
                else if (typeof v === 'object') {
                    this.params['.' + k] = v;
                }
            }
        }

        return body;
    }

    /**
     * Checks if the specified parameter exists.
     *
     * @param param The name of the parameter to check (must include the desired prefix).
     * @returns `true` if the parameter exists, else `false`.
     */
    has(param: string): boolean {
        return this._param(param, false) !== undefined;
    }

    /**
     * Returns the value of a parameter parsed as a boolean.
     *
     * The values `true` and `t` are accepted as `true`, while `false` and `f` represents `false`.
     *
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter is missing or cannot be
     * parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter is missing or cannot be
     * parsed.
     * @returns     The parameter parsed as a boolean.
     */
    boolean(param: string): boolean;
    /**
     * Returns the value of a parameter parsed as a boolean, or a default in case the parameter is missing.
     *
     * The values `true` and `t` are accepted as `true`, while `false` and `f` represents `false`.
     *
     * @template T  The type of the {@link def} parameter.
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @param def   The value that should be returned if the parameter could not be found.
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter cannot be parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter cannot be parsed.
     * @returns     The parameter parsed as a boolean, or the value of `def`.
     */
    boolean<T extends boolean | undefined | null>(param: string, def: T): boolean | T;
    boolean(param: string, def?: boolean | undefined | null): boolean | undefined | null {
        const value = this._param(param, arguments.length === 1)?.toString();

        if (value === undefined) {
            return def;
        }
        else if (value === 'true' || value === 't') {
            return true;
        }
        else if (value === 'false' || value === 'f') {
            return false;
        }
        else {
            throw this._makeWebError(param, 'is not a valid boolean');
        }
    }

    /**
     * Returns the value of a parameter parsed as an ISO date/timestamp.
     *
     * The values `true` and `t` are accepted as `true`, while `false` and `f` represents `false`.
     *
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter is missing or cannot be
     * parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter is missing or cannot be
     * parsed.
     * @returns     The parameter parsed as an ISO date/timestamp.
     */
    date(param: string): Date;
    /**
     * Returns the value of a parameter parsed as an ISO date/timestamp.
     *
     * Any date/timestamp that begins with at least 4 digits and is supported by `new Date()` is accepted.
     *
     * @template T  The type of the {@link def} parameter.
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @param def   The value that should be returned if the parameter could not be found.
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter cannot be parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter cannot be parsed.
     * @returns     The parameter parsed as an ISO date/timestamp, or the value of `def`.
     */
    date<T extends Date | undefined | null>(param: string, def: T): Date | T;
    date(param: string, def?: Date | undefined | null): Date | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined) {
            return def;
        }
        else {
            if (typeof value === 'string' && /^[0-9]{4}/.test(value)) {
                const parsed = new Date(value);

                if (isNaN(parsed.getTime())) {
                    throw this._makeWebError(param, 'is not a valid date');
                }

                return parsed;
            }
            else if (value instanceof Date) {
                return value;
            }
            else {
                throw this._makeWebError(param, 'is not a valid date');
            }
        }
    }

    /**
     * Returns the value of a parameter parsed as a number.
     *
     * Any number supported by `Number()` is accepted. This means that `0x`, `0b` and `0o` prefices are respected.
     *
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter is missing or cannot be
     * parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter is missing or cannot be
     * parsed.
     * @returns     The parameter parsed as a number.
     */
    number(param: string): number;
    /**
     * Returns the value of a parameter parsed as a number.
     *
     * Any number supported by `Number()` is accepted. This means that `0x`, `0b` and `0o` prefices are respected.
     *
     * @template T  The type of the {@link def} parameter.
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @param def   The value that should be returned if the parameter could not be found.
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter cannot be parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter cannot be parsed.
     * @returns     The parameter parsed as a number, or the value of `def`.
     */
    number<T extends number | undefined | null>(param: string, def: T): number | T;
    number(param: string, def?: number | undefined | null): number | undefined | null {
        const value = this._param(param, arguments.length === 1)?.toString();

        if (value === undefined) {
            return def;
        }
        else {
            const parsed = Number(value);

            if (isNaN(parsed)) {
                throw this._makeWebError(param, 'is not a valid number');
            }

            return parsed;
        }
    }

    /**
     * Returns the value of a parameter as an object.
     *
     * Note that only parameters coming from the request body can actually be objects.
     *
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter is missing or cannot be
     * parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter is missing or cannot be
     * parsed.
     * @returns     The parameter as an object.
     */
    object<T extends object>(param: string): T;
    /**
     * Returns the value of a parameter as an object.
     *
     * Note that only parameters coming from the request body can actually be objects.
     *
     * @template T  The type of the {@link def} parameter.
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @param def   The value that should be returned if the parameter could not be found.
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter cannot be parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter cannot be parsed.
     * @returns     The parameter as an object, or the value of `def`.
     */
    object<T extends object | undefined | null>(param: string, def: T): object | T;
    object<T extends object>(param: string, def?: T | undefined | null): T | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined || value === null) {
            return def;
        }
        else {
            if (typeof value !== 'object') {
                throw this._makeWebError(param, 'is not a valid object');
            }

            return value as T;
        }
    }

    /**
     * Returns the value of a parameter as a string.
     *
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter is missing or cannot be
     * parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter is missing or cannot be
     * parsed.
     * @returns     The parameter as a string.
     */
    string(param: string): string;
    /**
     * Returns the value of a parameter as a string.
     *
     * @template T  The type of the {@link def} parameter.
     * @param param The name of the parameter to fetch (must include the desired prefix).
     * @param def   The value that should be returned if the parameter could not be found.
     * @throws      {@link WebError}({@link WebStatus.BAD_REQUEST}) if a non-body parameter cannot be parsed.
     * @throws      {@link WebError}({@link WebStatus.UNPROCESSABLE_ENTITY}) if a body parameter cannot be parsed.
     * @returns     The parameter as a string, or the value of `def`.
     */
    string<T extends string | undefined | null>(param: string, def: T): string | T;
    string(param: string, def?: string | undefined | null): string | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined) {
            return def;
        }
        else {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ) {
                return value.toString();
            }
            else if (value instanceof Date) {
                return value.toISOString();
            }
            else {
                throw this._makeWebError(param, 'is not a valid string');
            }
        }
    }

    private _param(param: string, required: boolean): boolean | number | string | object | null | undefined {
        const value = this.params[param];

        if (value === undefined && required) {
            throw this._makeWebError(param, 'is missing');
        }
        else {
            return value;
        }
    }

    private _makeWebError(param: string, is: string): WebError {
        const [ status, subject ] =
            param[0] === '?' ? [ WebStatus.BAD_REQUEST,           `Query parameter '${param.substr(1)}'`   ] :
            param[0] === '@' ? [ WebStatus.BAD_REQUEST,           `Request header '${param.substr(1)}'`    ] :
            param[0] === '$' ? [ WebStatus.BAD_REQUEST,           `URL parameter '${param.substr(1)}'`     ] :
            param[0] === '.' ? [ WebStatus.UNPROCESSABLE_ENTITY,  `Entity parameter '${param.substr(1)}'`  ] :
            param[0] === '~' ? [ WebStatus.INTERNAL_SERVER_ERROR, `Custom parameter '${param.substr(1)}'`  ] :
            /* Not possible */ [ WebStatus.INTERNAL_SERVER_ERROR, `Invalid parameter '${param}'`           ] ;

        return new WebError(status, `${subject} ${is}`);
    }
}
