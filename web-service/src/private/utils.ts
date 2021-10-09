import { EventEmitter } from 'events';
import { Transform, TransformCallback, TransformOptions } from 'stream';

const PATCHED_CONSOLE_METHODS = [
    /* Console */    'assert', 'debug', 'dirxml', 'error', 'group', 'groupCollapsed', 'info', 'log', 'timeLog', 'trace', 'warn',
    /* SysConsole */ 'alert', 'crit', 'emerg', 'notice',
].reduce((map, fn) => (map[fn] = true, map), {} as { [fn: string]: true | undefined });

export function decorateConsole(console: Console, tag: string): Console {
    return new Proxy(console, {
        get: (target, p: string, receiver) => {
            const value = Reflect.get(target, p, receiver);

            if (typeof value === 'function' && PATCHED_CONSOLE_METHODS[p]) {
                return function (this: unknown, ...args: unknown[]) { return value.call(this, ...args, tag); };
            }
            else {
                return value;
            }
        }
    });
}

export function isAsyncIterable<T = unknown>(object: any): object is AsyncIterable<T> {
    return typeof object[Symbol.asyncIterator] === 'function';
}

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream;
export function isReadableStream(obj: NodeJS.ReadableStream): obj is NodeJS.ReadableStream {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export class SizeLimitedReadableStream extends Transform {
    private _count = 0;

    constructor(private _maxContentLength: number, private _makeError: () => Error, opts?: TransformOptions) {
        super(opts);
    }

    _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void {
        if (chunk instanceof Buffer || typeof chunk === 'string') {
            this._count += chunk.length;

            if (this._count > this._maxContentLength) {
                callback(this._makeError());
            }
            else {
                callback(null, chunk);
            }
        }
        else {
            callback(new Error('Expected Buffer or string chunk'));
        }
    }

    _flush(callback: TransformCallback): void {
        callback();
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ExtAsyncIterable<T, TReturn, TNext> extends AsyncIterator<T, TReturn, TNext> {
    [Symbol.asyncIterator](): AsyncIterator<T, TReturn, TNext>;
}

export function unblocked<T, TReturn, TNext>(it: AsyncGenerator<T, TReturn, TNext>, timeout: number): AsyncGenerator<T | undefined, TReturn, TNext>;
export function unblocked<T, TReturn, TNext>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, timeout: number): ExtAsyncIterable<T | undefined, TReturn, TNext>;
export function unblocked<T, TReturn, TNext>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, timeout: number): ExtAsyncIterable<T | undefined, TReturn, TNext> {
    let next: Promise<IteratorResult<T, TReturn>> | undefined = undefined;

    const g = isAsyncIterable<T>(it) ? it[Symbol.asyncIterator]() as AsyncIterator<T, TReturn, TNext>: it;

    const ag: ExtAsyncIterable<T | undefined, TReturn, TNext> = {
        next: async (...args) => {
            if (!next) {
                next = g.next(...args);
            }

            const nextOrVoid = await Promise.race([next, sleep(timeout)]);

            if (nextOrVoid) {
                next = undefined;
                return nextOrVoid;
            }
            else {
                return { done: false as const, value: undefined };
            }
        },

        return: g.return ? (u) => g.return!(u) : undefined,
        throw:  g.throw  ? (e) => g.throw!(e)  : undefined,

        [Symbol.asyncIterator]: () => ag,
    };

    return ag;
}
