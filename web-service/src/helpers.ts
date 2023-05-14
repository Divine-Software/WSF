/* eslint-disable @typescript-eslint/no-unused-vars */
import { unblocked } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { EventStreamEvent, Parser } from '@divine/uri';
import { WebError, WebStatus } from './error';
import { WebArguments, WebFilter, WebResource } from './resource';
import { WebResponse, WebResponseHeaders } from './response';

function asSet(array: string | string[] | undefined): Set<string> {
    return new Set(typeof array === 'string' ? array.split(/\s*,\s*/) : array ?? []);
}

/** Request parameters provided to the protected configuration methods in the {@link CORSFilter} helper class. */
export interface CORSFilterParams {
    /** The request arguments. */
    args:     WebArguments;

    /** The potentially CORS-protected resource that was accessed. */
    resource: WebResource;

    /** The response that the potentially CORS-protected {@link WebResource} produced. */
    response: WebResponse;
}

/**
 * A CORS-handling {@link WebFilter} helper class.
 *
 * The implementation is configured/customized by overriding the filter's protected methods: {@link _isOriginAllowed},
 * {@link _isMethodAllowed}, {@link _isHeaderAllowed}, {@link _isHeaderExposed}, {@link _isCredentialsSupported} and
 * {@link _getMaxAge}.
 *
 * By default, all origins, methods and headers are allowed for 10 minutes. Credentials are *not* allowed by default.
 */
export abstract class CORSFilter implements WebFilter {
    protected static readonly _excluded = new Set(['cache-control', 'content-language', 'content-type', 'expires', 'last-modified', 'pragma']);

    async filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>): Promise<WebResponse> {
        const response = await next();
        const exposed  = Object.keys(response.headers); // Read before we add any extra
        const params   = { args, resource: await resource(), response };
        const origin   = args.string('@origin', undefined);

        if (this._isOriginAllowed(origin, params)) {
            const method = args.string('@access-control-request-method', undefined);

            if (method !== undefined && args.request.method === 'OPTIONS') { // Preflight
                const methods = asSet(response.headers.allow).add(method);
                const headers = args.string('@access-control-request-headers', '').toLowerCase().split(/\s*,\s*/);

                response
                    .setHeader('access-control-allow-methods',  [...methods].filter((h) => this._isMethodAllowed(h, params)).join(', '))
                    .setHeader('access-control-allow-headers',  headers.filter((h) => this._isHeaderAllowed(h, params)).join(', '))
                    .setHeader('access-control-max-age',        this._getMaxAge(params));
                }

            if (this._isCredentialsSupported(params)) {
                response.setHeader('access-control-allow-credentials', 'true');
            }

            response
                .setHeader('access-control-allow-origin',   origin)
                .setHeader('access-control-expose-headers', exposed.filter((h) => this._isHeaderExposed(h, params)).join(', '))
                .setHeader('vary',                          [...asSet(response.headers.vary).add('origin')].join(', '));
        }

        return response;
    }

    /**
     * Checks if the given `origin` is allowed to make a CORS request.
     *
     * The CORS specification recommends a server to return {@link WebStatus.FORBIDDEN} if a CORS request is denied. You
     * can do that by throwing a {@link WebError} instead of returning `false`, like this:
     *
     * ```ts
     * protected _isOriginAllowed(origin: string | undefined, params: CORSFilterParams): boolean {
     *     if (origin === 'https://example.com') {
     *         return true;
     *     } else {
     *         throw new WebError(WebStatus.FORBIDDEN, `CORS request from origin ${origin} denied`);
     *     }
     * }
     * ```
     *
     * @param origin The value of the origin header, or undefined if the header was not provided.
     * @param params Request parameters.
     * @returns `true` if the request is allowed, else `false`.
     */
    protected _isOriginAllowed(origin: string | undefined, params: CORSFilterParams): boolean {
        return origin !== undefined;
    }

    /**
     * Checks if the given request method should be allowed.
     *
     * @param method Name of method.
     * @param params Request parameters.
     * @returns `true` if the method is allowed, else `false`.
     */
    protected _isMethodAllowed(method: string, params: CORSFilterParams): boolean {
        return true;
    }

    /**
     * Checks if the given request header should be allowed.
     *
     * @param method Name of header.
     * @param params Request parameters.
     * @returns `true` if the header is allowed, else `false`.
     */
    protected _isHeaderAllowed(header: string, params: CORSFilterParams): boolean {
        return true;
    }

    /**
     * Checks if the given response header should be exposed to the client.
     *
     * @param method Name of header.
     * @param params Request parameters.
     * @returns `true` if the header is exposed, else `false`.
     */
    protected _isHeaderExposed(header: string, params: CORSFilterParams): boolean {
        return !CORSFilter._excluded.has(header);
    }

    /**
     * Checks if credentials should be allowed.
     *
     * @param params Request parameters.
     * @returns `true` if credentials should be allowed, else `false`.
     */
    protected _isCredentialsSupported(params: CORSFilterParams): boolean {
        return false;
    }

    /**
     * Returns the number of seconds the information provided by the `access-control-allow-methods` and
     * `access-control-allow-headers` headers can be cached.
     *
     * The default for this implementation is 600 seconss or 10 minutes. Note that the default value in the CORS
     * specification, i.e. if no `access-control-max-age` is sent to the client, is just 5 seconds.
     *
     * @param params Request parameters.
     * @returns The number of seconds the client may cache the information.
     */
    protected _getMaxAge(params: CORSFilterParams): number {
        return 600;
    }
}

/** A symbol in {@link EventAttributes} representing the event's `id` field */
export const EVENT_ID    = Symbol('EVENT_ID');

/** A symbol in {@link EventAttributes} representing the event's `event` field */
export const EVENT_TYPE  = Symbol('EVENT_TYPE');

/** A symbol in {@link EventAttributes} representing the event's `retry` field */
export const EVENT_RETRY = Symbol('EVENT_RETRY');

/** Metadata to be transmitted along with a single event by the {@link EventStreamResponse} helper class. */
export interface EventAttributes {
    /** Used to update the client's last event ID value. */
    [EVENT_ID]?:    string;

    /** A string identifying the type of event described. */
    [EVENT_TYPE]?:  string;

    /** The reconnection time. If the connection to the server is lost, the browser will wait for the specified time before attempting to reconnect. */
    [EVENT_RETRY]?: number;
}

/**
 * Server-Sent Events (SSE) {@link WebResponse} serializer/helper class.
 *
 * @template T The type of events to transmit.
 */
export class EventStreamResponse<T = unknown> extends WebResponse {
    private static async *_eventStream(source: AsyncIterable<any>, dataType?: ContentType | string, keepaliveTimeout?: number): AsyncGenerator<EventStreamEvent | undefined> {
        const serialize = async (event: unknown): Promise<string> => {
            const [serialized] = await Parser.serializeToBuffer(event, dataType);

            return serialized.toString(); // SSE is always UTF-8
        };

        try {
            source = keepaliveTimeout === undefined ? source : unblocked(source, keepaliveTimeout);

            for await (const event of source) {
                if (event === undefined || event === null) {
                    yield undefined; // Emit keep-alive comment line (see EventStreamParser.serialize())
                }
                else {
                    yield { id: event[EVENT_ID], event: event[EVENT_TYPE], retry: event[EVENT_RETRY], data: await serialize(event) };
                }
            }
        }
        catch (err) {
            try {
                if (err instanceof WebError) {
                    yield { event: 'error', data: await serialize({ status: err.status, message: err.message }) };
                }
                else {
                    console.error(`Unexpected EventStream error`, err);
                    yield { event: 'error', data: await serialize({ status: WebStatus.INTERNAL_SERVER_ERROR, message: `Unexpected EventStream error` }) };
                }
            }
            catch (err2) {
                console.error(`Unexpected EventStream serialization error`, err2, err);
                yield { event: 'error', data: String(err2) }; // Inform client of error serialization errors ... as text/plain
            }
        }
    }

    /**
     * Converts an `AsyncIterable` into a *Server-Sent Event* response stream.
     *
     * Each object yielded by the `source` generator will be serialized and converted to an SSE event. Symbols from the
     * {@link EventAttributes} interface may be added to transmit event metadata. `null` or `undefined` values will
     * result in a comment event. If no value is emitted for `keepaliveTimeout` milliseconds, a comment line will be
     * sent automatically, in order to signal to the client that the server is still alive and the connection is open.
     *
     * Exceptions from the generator will be serialized and sent as events of type `error`.
     *
     * @template T             The type of events to transmit.
     * @param source           The `AsyncIterable` which yields events to transmit.
     * @param dataType         The format of the individual events. Default is JSON.
     * @param headers          Custom response headers to send.
     * @param keepaliveTimeout How often, in milliseconds, to automatically send comments/keep-alive lines.
     */
    constructor(source: AsyncIterable<T | T & EventAttributes | undefined | null>, dataType?: ContentType | string, headers?: WebResponseHeaders, keepaliveTimeout?: number) {
        super(WebStatus.OK, EventStreamResponse._eventStream(source, dataType, keepaliveTimeout), {
            'content-type':      'text/event-stream',
            'connection':        'close',
            'cache-control':     'no-store',
            'transfer-encoding': 'identity',
            ...headers
        });
    }
}
