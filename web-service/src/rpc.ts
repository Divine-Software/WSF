import { escapeRegExp, isAsyncIterable } from '@divine/commons';
import { WebService } from './service';
import { EventStreamResponse } from './helpers';
import { WebArguments, WebResourceCtor } from './resource';

type RPCParamsType = object;
type RPCResultType = object | AsyncIterable<object>;
type RPCMethods<M> = Record<keyof M, [RPCParamsType, RPCResultType]>;

/**
 * Given the compile-time RPC service API interface and a method name, extracs the request parameters.
 *
 * @template M The interface that defines all RPC method request and response types (as tuples).
 */
export type RPCParams<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer A, infer _B] ? A : never;

/**
 * Given the compile-time RPC service API interface and a method name, extracs the result/response type.
 *
 * @template M The interface that defines all RPC method request and response types (as tuples).
 */
export type RPCResult<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer _A, infer B] ? B : never;

/**
 * The RPC client API. Used by clients to call an RPC method.
 *
 * @template M The interface that defines all RPC method request and response types (as tuples).
 */
export type RPCClient<M extends RPCMethods<M>> = {
    [K in keyof M]: (params: RPCParams<M, K>) => Promise<RPCResult<M, K>>;
}

/**
 * The RPC service API. The server should implement this API to handle incoming RPC method calls.
 *
 * @template M The interface that defines all RPC method request and response types (as tuples).
 */
export type RPCService<M extends RPCMethods<M>> = {
    [K in keyof M]: (params: RPCParams<M, K>, args: WebArguments) => Promise<RPCResult<M, K>>;
}

/** The default keep-alive time for event streams, in milliseconds (10 s). */
export const RPC_DEFAULT_KEEPALIVE = 10_000;

/** The value to specify if keep-alive for event streams should be disabled. */
export const RPC_DISABLE_KEEPALIVE = null;

/** End-point configuration for an RPC method. */
export interface RPCEndpointOptions {
    /** The path of this RPC method. Default is simply the RPC method name. */
    path?:      string;

    /** Keep-alive time in milliseconds, in case this RPC call is an event stream. Default is [[RPC_DEFAULT_KEEPALIVE]]. */
    keepalive?: number | null;
}

/**
 * RPC endpoint configuration. For each RPC method (the key) this interface contains either an [[RPCEndpointOptions]]
 * object or `null` for defaults.
 *
 * This object is the run-time (JavaScript) view of the RPC service API. It's important that every RPC method is present
 * in this object, even if its configuration is `null`, becasue this is the only source of method names for JavaScript.
 * Both [[createRPCClient]] and [[createRPCService]] use this object as input when creating the RPC client or service
 * proxy.
 *
 * @template M  The interface that defines all RPC method request and response types (as tuples). This is the
 *              compile-time (TypeScript) view of the RPC service API.
 */
export type RPCEndpoints<M extends RPCMethods<M>> = Record<keyof M, RPCEndpointOptions | null>;

/**
 * The static side of an RPC service.
 *
 * Specifies how the service is constructed.
 *
 * @template Context The type of the `context` argument.
 * @template M       The interface that defines all RPC method request and response types (as tuples).
 */
export interface RPCServiceCtor<Context, M extends RPCMethods<M>> {
    /**
     * Constructs a new RPC service instance.
     *
     * @param context The [[WebService]] context.
     * @param args    The request arguments.
     * @returns       A new [[RPCService]] instance.
     */
    new(context: Context, args: WebArguments): RPCService<M>;
}

/**
 * This function is should issue an HTTP `POST` request to the remote server and return the response.
 *
 * A minimal implementation using `@divine/uri` could look like this:
 *
 * ```ts
 * interface MyAPI {
 *     hello: [ { who?: string }, { greeting: string } ];
 * }
 *
 * const clientProxy: RPCClientProxy<MyAPI> = (method, options, params) =>
 *     new URI(options.path, 'http://api.example.com/my-api/').append(params);
 * ```
 *
 * @template M       The interface that defines all RPC method request and response types (as tuples).
 * @param    method  The name of the RPC method to invoke.
 * @param    options Contains the RPC method endpoint in the [[RPCEndpointOptions.path | path]] property.
 * @param    params  RPC method parameters to be `POST`'ed.
 * @returns          The response as receieved from the RPC serivce.
 */
export type RPCClientProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, params: RPCParamsType) => Promise<RPCResultType>

/**
 * This function should load the request parameters from [[WebArguments.body]] and invoke the callback function.
 *
 * This is a great place to perform input validation (perhaps using a schema), authenticate the client somehow or add
 * custom response headers. If an `AsyncIterable` is returned, it will automatically be wrapped in an [[EventStreamResponse]],
 * but otherwise, you free to constuct the response as you wish.
 *
 * A minimal implementation could look like this:
 *
 * ```ts
 * interface MyAPI {
 *     hello: [ { who?: string }, { greeting: string } ];
 * }
 *
 * const serviceProxy: RPCSeviceProxy<MyAPI> = async (method, options, args, fn) =>
 *     fn(await args.body());
 * ```
 *
 * @template M       The interface that defines all RPC method request and response types (as tuples).
 * @param    method  The name of the RPC method that should be invoked.
 * @param    options Contains the configured options for the RPC endpoint.
 * @param    args    Incoming HTTP request arguments. You should at least load the body from it.
 * @param    fn      The RPC service method that should be invoked with the request parameters.
 * @returns          The return value of the `fn` service method, either directly or wrapped in a [[WebResponse]].
 */
export type RPCSeviceProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, args: WebArguments, fn: (params: RPCParamsType) => Promise<RPCResultType>) => Promise<RPCResultType>

function endpoints<M extends RPCMethods<M>>(endpoints: RPCEndpoints<M>): Array<[keyof M, Required<RPCEndpointOptions>]> {
    return Object.entries(endpoints)
        .map(([method, options]) => [method as keyof M, {
            path:      method,
            keepalive: RPC_DEFAULT_KEEPALIVE,
            ...(options as RPCEndpointOptions | null ?? {})
        }]);
}

/**
 * Enumerates all keys in the [[RPCEndpoints]] object and generates an [[RPCClient]].
 *
 * Example usage:
 *
 * ```ts
 * interface MyAPI {
 *     hello: [ { who?: string; }, { greeting: string } ];
 * }
 *
 * const MyAPI: RPCEndpoints<MyAPI> = {
 *     hello: null,
 * }
 *
 * const myAPI = createRPCClient(MyAPI, async (method, options, params) =>
 *                   new URI(options.path, 'http://api.example.com/my-api/').append(params));
 *
 * const { greeting } = await myAPI.hello({ who: 'beautiful' });
 * console.log(greeting);
 * ```
 *
 * @template M        The interface that defines all RPC method request and response types (as tuples).
 * @param config      RPC endpoint configuration to generate a client API for.
 * @param clientProxy Utility function that makes the actual HTTP request.
 * @returns           A class that implements the client-side view of the RPC service API.
 */
export function createRPCClient<M extends RPCMethods<M>>(config: RPCEndpoints<M>, clientProxy: RPCClientProxy<M>): RPCClient<M> {
    return new class RPCClient {
        constructor() {
            const self = this as any;

            for (const [method, options] of endpoints(config)) {
                self[method] = (params: RPCParamsType) => clientProxy(method, options, params);
            }
        }
    } as RPCClient<M>;
}

/**
 * Enumerates all keys in the [[RPCEndpoints]] object and generates an array of [[WebResource]] classes which will
 * invoke the RPC service methods provided.
 *
 * Example usage:
 *
 * ```ts
 * interface MyAPI {
 *     hello: [ { who?: string; }, { greeting: string } ];
 * }
 *
 * const MyAPI: RPCEndpoints<MyAPI> = {
 *     hello: null,
 * }
 *
 * class MyAPIService implements RPCService<MyAPI> {
 *     async hello({ who }: RPCParams<MyAPI, 'hello'>): Promise<RPCResult<MyAPI, 'hello'>> {
 *         return { greeting: `Hello, ${who ?? 'World'}!` };
 *     }
 * }
 *
 * const ws = new WebService(null)
 *     .addResources(createRPCService(MyAPI, MyAPIService,
 *         async (method, options, args, fn) => fn(await args.body())));
 * ```
 *
 * @template M          The interface that defines all RPC method request and response types (as tuples).
 * @template Context    The [[WebService]] context type.
 * @param config        RPC endpoint configuration to generate a client API for.
 * @param impl          An RPC service class. A new instance will be constructed for each incoming request.
 * @param serviceProxy  A function that extracts the request parameters, calls the RPC service method and retuns the
 *                      result.
 * @returns             An array of [[WebResource]] classes that should be registered to a WebService via
 *                      [[WebService.addResources]].
 */
export function createRPCService<M extends RPCMethods<M>, Context>(config: RPCEndpoints<M>, impl: RPCServiceCtor<Context, M>, serviceProxy: RPCSeviceProxy<M>): Array<WebResourceCtor<Context>>;
/**
 * Enumerates all keys in the [[RPCEndpoints]] object and generates an array of [[WebResource]] classes which will
 * invoke the RPC service methods provided.
 *
 * Example usage:
 *
 * ```ts
 * interface MyAPI {
 *     hello: [ { who?: string; }, { greeting: string } ];
 * }
 *
 * const MyAPI: RPCEndpoints<MyAPI> = {
 *     hello: null,
 * }
 *
 * const myAPIService = new class implements RPCService<MyAPI> {
 *     async hello({ who }: RPCParams<MyAPI, 'hello'>): Promise<RPCResult<MyAPI, 'hello'>> {
 *         return { greeting: `Hello, ${who ?? 'World'}!` };
 *     }
 * }
 *
 * const ws = new WebService(null)
 *     .addResources(createRPCService(MyAPI, myAPIService,
 *         async (method, options, args, fn) => fn(await args.body())));
 * ```
 *
 * * @template M          The interface that defines all RPC method request and response types (as tuples).
 * @template Context    The [[WebService]] context type.
 * @param config        RPC endpoint configuration to generate a client API for.
 * @param impl          An RPC service instance (which may be stateful). Its methods will be invoked directly.
 * @param serviceProxy  A function that extracts the request parameters, calls the RPC service method and retuns the
 *                      result.
 * @returns             An array of [[WebResource]] classes that should be registered to a WebService via
 *                      [[WebService.addResources]].
 */
export function createRPCService<M extends RPCMethods<M>>(config: RPCEndpoints<M>, impl: RPCService<M>, serviceProxy: RPCSeviceProxy<M>): Array<WebResourceCtor<unknown>>;
export function createRPCService<M extends RPCMethods<M>, Context = unknown>(config: RPCEndpoints<M>, impl: RPCServiceCtor<Context, M> | RPCService<M>, serviceProxy: RPCSeviceProxy<M>): Array<WebResourceCtor<Context>> {
    return endpoints(config).map(([method, options]) =>
        class RPCResource {
            static path = RegExp(escapeRegExp(options.path));

            constructor(private _ctx: Context) {}

            async POST(args: WebArguments): Promise<object> {
                const object = typeof impl === 'function' ? new impl(this._ctx, args) : impl;
                const result = await serviceProxy(method, options, args, (params) => object[method](params as any, args) as Promise<object>);

                return isAsyncIterable<object>(result) ? new EventStreamResponse(result, undefined, undefined, options.keepalive ?? undefined) : result;
            }
        }
    );
}

interface MyAPI {
    hello: [ { who?: string; }, { greeting: string } ];
}

const MyAPI: RPCEndpoints<MyAPI> = {
    hello: null,
}

const myAPIService = new class implements RPCService<MyAPI> {
    async hello({ who }: RPCParams<MyAPI, 'hello'>): Promise<RPCResult<MyAPI, 'hello'>> {
        return { greeting: `Hello, ${who ?? 'World'}!` };
    }
}

const ws = new WebService(null)
    .addResources(createRPCService(MyAPI, myAPIService,
        async (method, options, args, fn) => fn(await args.body())));