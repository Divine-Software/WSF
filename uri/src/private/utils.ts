import { EventEmitter } from 'events';
import { pipeline, Readable } from 'stream';

export type Constructor<T> = new (...args: any[]) => T;
export type ValueEncoder = (this: void, value: string, key: string | number) => string;

export type BasicTypes = boolean | number | bigint | string | object | null;

export interface Params extends Record<string, BasicTypes | undefined> {}

export function kvWrapper(wrapped: unknown): Params {
    return new Proxy(wrapped, {
        has: (target: any, prop: any) => {
            console.log(`kvWrapper.has ${prop} => ${target[prop] !== undefined}`);
            return target[prop] !== undefined;
        },

        get: (target: any, prop: any) => {
            console.log(`kvWrapper.get ${prop} => ${target[prop]}`);
            return target[prop];
        },
    });
}

/** Percent-encode everything except 0-9, A-Z, a-z, `-`, `_`, `.`, `!` and `~`. */
export function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function es6Encoder(strings: TemplateStringsArray, values: unknown[], encoder: ValueEncoder): string {
    let result = strings[0];

    for (let i = 0; i < values.length; ++i) {
        result += encoder(String(values[i]), i) + strings[i + 1];
    }

    return result;
}

export function esxxEncoder(template: string, params: Params, encoder: ValueEncoder): string {
    return template.replace(/(^|[^\\])(\\\\)*{([^{}[\]()"'`\s]+)}/g, (match) => {
        const start = match.lastIndexOf('{');
        const param = match.substring(start + 1, match.length - 1);
        const value = params[param];

        return match.substring(0, start) + encoder(String(value), param);
    });
}

export async function *toAsyncIterable(data: string | Buffer | AsyncIterable<Buffer | string>): AsyncIterable<Buffer> {
    if (data instanceof Buffer) {
        yield data;
    }
    else if (isAsyncIterable(data)) {
        for await (const chunk of data) {
            yield chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        }
    }
    else {
        yield Buffer.from(data);
    }
}

export function toReadableStream(data: string | Buffer | AsyncIterable<Buffer | string>): Readable {
    if (typeof data === 'string' || data instanceof Buffer) {
        return Readable.from(toAsyncIterable(data));
    }
    else {
        return Readable.from(data);
    }
}

export function copyStream(from: NodeJS.ReadableStream, to: NodeJS.WritableStream): Promise<typeof to> {
    return new Promise<typeof to>((resolve, reject) => {
        pipeline(from, to, (err) => err ? reject(err) : resolve(to));
    });
}

export function isAsyncIterable<T = unknown>(object: any): object is AsyncIterable<T> {
    return typeof object?.[Symbol.asyncIterator] === 'function';
}

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream;
export function isReadableStream(obj: NodeJS.ReadableStream): obj is NodeJS.ReadableStream {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function isTemplateStringsLike(strings: any): strings is TemplateStringsArray;
export function isTemplateStringsLike(strings: TemplateStringsArray): strings is TemplateStringsArray {
    return Array.isArray(strings) && strings.every((s) => typeof s === 'string');
}

export function isDOMNode(obj: unknown): boolean {
    return !!obj && typeof (obj as any).nodeType === 'number'; /* FIXME */
}

export function isJSON(obj: unknown): boolean {
    return obj instanceof Array || !!obj && Object.getPrototypeOf(obj) === Object.prototype;
}

export function b64Decode(b64: string): string {
    return Buffer.from(b64, 'base64').toString();
}

export function b64Encode(str: string): string {
    return Buffer.from(str).toString('base64');
}

export function setProp<T extends object, K extends keyof T>(object: T, prop: K, value: T[K]): T {
    object[prop] = value;
    return object;
}
