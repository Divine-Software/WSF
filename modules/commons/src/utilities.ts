/* eslint-disable jsdoc/require-jsdoc */

import { toString } from './strings';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function as<T>(value: T): T {
    return value;
}

export function isOneOf<T extends string | number | null, V extends T[]>(value: T | undefined, of: V): value is V[number] {
    return value !== undefined && of.includes(value);
}

export function throwError(err: Error | string): never {
    throw asError(err);
}

export function asError(err: unknown): Error {
    return err instanceof Error ? err : new Error(toString(err));
}

export function getOrSetEntry<K, V>(map: Map<K, V>, key: K, value: V): V {
    const result = map.get(key);

    if (result !== undefined) {
        return result;
    } else {
        return map.set(key, value), value;
    }
}

export function isDOMNode(obj: unknown): boolean {
    return !!obj && typeof (obj as any).nodeType === 'number'; /* FIXME */
}

export function isXML(obj: unknown): boolean {
    return isDOMNode(obj) || typeof (obj as any)?.$domNode === 'function';
}

export function isHTML(obj: unknown): boolean {
    if (isXML(obj)) {
        const dom = isDOMNode(obj) ? obj : (obj as any)?.$domNode();
        const uri = dom?.namespaceURI ?? dom?.ownerElement?.namespaceURI ?? dom?.ownerDocument?.documentElement?.namespaceURI;

        return uri === 'http://www.w3.org/1999/xhtml';
    }
    else {
        return false;
    }
}

export function isJSON(obj: unknown): obj is object | unknown[] {
    return !!obj && (isOneOf(Object.getPrototypeOf(obj), [null, Array.prototype, Object.prototype]));
}

const recordDescriptors: PropertyDescriptorMap = {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [Symbol.toPrimitive]: { value: Object.prototype.toString },
    [Symbol.toStringTag]: { value: 'Record' }
};

export function Record<T = any>(entries: Array<[PropertyKey, T]> | { [key: PropertyKey]: T } = []): { [k: string]: T; } {
    entries = Array.isArray(entries) ? entries : Object.entries(entries);

    const descriptors: PropertyDescriptorMap = {
        ...Object.fromEntries(entries.map(([prop, value]) => [ prop, { value, configurable: true, enumerable: true, writable: true }])),
        ...recordDescriptors,
    }

    return Object.create(null, descriptors);
}

export function recordify<T>(value: T): T {
    if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
            value.forEach((v, i, a) => a[i] = recordify(v));
        } else if (Object.getPrototypeOf(value) === Object.prototype) {
            Object.entries(value).forEach(([k, v]) => value[k as keyof T] = recordify(v));
            Object.defineProperties(Object.setPrototypeOf(value, null), recordDescriptors);
        }
    }

    return value;
}
