import { escapeRegExp, isAsyncIterable } from '@divine/commons';
import { EventStreamResponse } from './helpers';
import { WebArguments, WebResourceCtor } from './resource';

type RPCParamsType = object;
type RPCResultType = object | AsyncIterable<object>;
type RPCMethods<M> = Record<keyof M, [RPCParamsType, RPCResultType]>;

export type RPCParams<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer A, infer _B] ? A : never;
export type RPCResult<M extends RPCMethods<M>, K extends keyof M> = M[K] extends [infer _A, infer B] ? B : never;

export type RPCClient<M extends RPCMethods<M>> = {
    [K in keyof M]: (params: RPCParams<M, K>) => Promise<RPCResult<M, K>>;
}

export type RPCService<M extends RPCMethods<M>> = {
    [K in keyof M]: (params: RPCParams<M, K>, args: WebArguments) => Promise<RPCResult<M, K>>;
}

export const RPC_DEFAULT_KEEPALIVE = 10_000;
export const RPC_DISABLE_KEEPALIVE = null;

export interface RPCEndpointOptions {
    path?:      string;
    keepalive?: number | null;
}

export type RPCEndpoints<M extends RPCMethods<M>> = Record<keyof M, RPCEndpointOptions | null>;

export interface RPCServiceCtor<Context, M extends RPCMethods<M>> {
    new(context: Context, args: WebArguments): RPCService<M>;
}

export type RPCClientProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, params: RPCParamsType) => Promise<RPCResultType>
export type RPCSeviceProxy<M extends RPCMethods<M>> = (method: keyof M, options: Required<RPCEndpointOptions>, args: WebArguments, fn: (params: RPCParamsType) => Promise<RPCResultType>) => Promise<RPCResultType>

function endpoints<M extends RPCMethods<M>>(endpoints: RPCEndpoints<M>): Array<[keyof M, Required<RPCEndpointOptions>]> {
    return Object.entries(endpoints)
        .map(([method, options]) => [method as keyof M, {
            path:      method,
            keepalive: RPC_DEFAULT_KEEPALIVE,
            ...(options as RPCEndpointOptions | null ?? {})
        }]);
}

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

export function createRPCService<M extends RPCMethods<M>, Context>(config: RPCEndpoints<M>, impl: RPCServiceCtor<Context, M>, serviceProxy: RPCSeviceProxy<M>): Array<WebResourceCtor<Context>>;
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

