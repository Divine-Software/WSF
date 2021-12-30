import { inspect } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { X4EList } from './x4e-list';
import { X4E } from './x4e-node';
import { Call, Get, GetOwnProperty, HasProperty, OwnPropertyKeys } from './x4e-utils';

export type CallMethod = (...args: unknown[]) => unknown;

export interface X4EProxyTarget {
    // § 9.1.1.1 (X4E: attributes optional)
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined;

    // § 9.2.1.5 (X4E: attributes optional)
    [HasProperty](name: string | number, allowAttributes: boolean): boolean;

    // 11.2.2.1 CallMethod X4E: Not really)
    [Call]?: CallMethod;

    // § 12.2 The for-in Statement
    [OwnPropertyKeys](): string[];
    [GetOwnProperty](p: string): PropertyDescriptor | undefined;
}

export function asXML<TNode extends Node>(node: TNode): XML<TNode> {
    return new Proxy(new X4E(node), X4EProxyHandler) as XML<TNode>;
}

export function asXMLList<TNode extends Node>(list: TNode | ArrayLike<TNode> | null | undefined, source?: X4EProxyTarget, prop?: string): XMLList<TNode> {
    let object = new X4EList(list);
    const func = source && (source as any)[prop!];

    if (typeof func === 'function') {
        object[Call] = func;

        const CallMethod = () => void 0;
        Reflect.setPrototypeOf(CallMethod, object);
        object = CallMethod as unknown as X4EList<TNode>;
    }

    return new Proxy(object, X4EProxyHandler) as XMLList<TNode>;
}

export const X4EProxyHandler: ProxyHandler<X4EProxyTarget> = {
    // 11.2.2.1 CallMethod (X4E: Not really)
    getPrototypeOf(target) {
        target = typeof target === 'function' ? Reflect.getPrototypeOf(target) as typeof target: target;

        return Reflect.getPrototypeOf(target);
    },

    // § 11.2.1 Property Accessors
    get(target, p: string | symbol, receiver) {
        if (typeof p === 'string' && p[0] !== '$') {
            const value = target[Get](p, false);

            if (value instanceof Array) {
                return asXMLList(value, target, p);
            }
            else if (value) {
                return asXML(value);
            }
            else {
                return value;
            }
        }

        return Reflect.get(target, p, receiver);
    },

    // § 9.1.1.6 (X4E: attributes optional)
    has(target, p: string | symbol) {
        if (typeof p === 'string' && p[0] !== '$') {
            return target[HasProperty](p, false);
        }

        return Reflect.has(target, p);
    },

    // 11.2.2.1 CallMethod (X4E: Not really)
    apply(target, self, args) {
        // If we get here, target must have a [Call] property, so just call it
        return target[Call]!.call(self, ...args);
    },

    // § 12.2 The for-in Statement
    ownKeys(target) {
        const x4eKeys = typeof target === 'function' ? Reflect.ownKeys(Reflect.getPrototypeOf(target) ?? {}) : [];

        return [ ...Reflect.ownKeys(target), ...x4eKeys, ...target[OwnPropertyKeys]() ];
    },

    // § 12.2 The for-in Statement
    getOwnPropertyDescriptor(target, p) {
        const x4eProp = typeof target === 'function' ? Reflect.getOwnPropertyDescriptor(Reflect.getPrototypeOf(target) ?? {}, p) : undefined;

        return Reflect.getOwnPropertyDescriptor(target, p) ?? x4eProp ?? (typeof p === 'string' && p[0] !== '$' ? target[GetOwnProperty](p) : undefined);
    },

    // Custom NodeJS inspector value: Hide this object from Node REPL
    [inspect.custom as any]() {
        return 'xml';
    }
}
