import { Queue } from '@divine/synchronization';
import { sleep, throwError } from './utilities';

interface ExtAsyncIterableIterator<T, TReturn, TNext> extends AsyncIterator<T, TReturn, TNext> {
    [Symbol.asyncIterator](): AsyncIterator<T, TReturn, TNext>;
}

export function isAsyncIterable<T = unknown>(object: any): object is AsyncIterable<T> {
    return typeof object?.[Symbol.asyncIterator] === 'function';
}

export async function *toAsyncIterable(data: string | Buffer | AsyncIterable<Buffer | string>): AsyncIterable<Buffer> {
    if (data instanceof Buffer) {
        yield data;
    }
    else if (isAsyncIterable(data)) {
        for await (const chunk of data) {
            yield chunk instanceof Buffer   ? chunk
                : typeof chunk === 'string' ? Buffer.from(chunk)
                : throwError(new TypeError(`Expected AsyncIterable<Buffer | string> but found AsyncIterable<${String(chunk)}>`))
        }
    }
    else {
        yield Buffer.from(data);
    }
}

export class AsyncIteratorAdapter<T, R = void> implements AsyncIterable<T> {
    private _queue = new Queue<{ event: T } | { error: Error } | { result: R }>();

    constructor(private _close?: () => Promise<void>) {
    }

    onClose(close: () => Promise<void>): this {
        this._close = close;
        return this;
    }

    next(event: T): this {
        this._queue.push({ event });
        return this;
    }

    throw(error: Error): this {
        this._queue.push({ error });
        return this;
    }

    return(result: R): this {
        this._queue.push({ result });
        return this;
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<T, R> {
        try {
            while (true) {
                const e = await this._queue.shiftOrWait();

                if ('event' in e) {
                    yield e.event;
                }
                else if ('error' in e) {
                    throw e.error;
                }
                else if ('result' in e) {
                    return await e.result;
                }
            }
        }
        finally {
            await this._close?.();
        }
    }
}

export function mapped<T, TReturn, TNext, R>(it: AsyncGenerator<T, TReturn, TNext>, fn: (value: T) => R | Promise<R>): AsyncGenerator<R, TReturn, TNext>;
export function mapped<T, TReturn, TNext, R>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, fn: (value: T) => R | Promise<R>): ExtAsyncIterableIterator<R, TReturn, TNext>;
export function mapped<T, TReturn, TNext, R>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, fn: (value: T) => R | Promise<R>): ExtAsyncIterableIterator<R, TReturn, TNext> {
    const g = isAsyncIterable<T>(it) ? it[Symbol.asyncIterator]() as AsyncIterator<T, TReturn, TNext> : it;

    const mapIR = async (next: IteratorResult<T, TReturn>): Promise<IteratorResult<R, TReturn>> => {
        return next.done ? next : { done: next.done, value: await fn(next.value) }
    }

    const ag: ExtAsyncIterableIterator<R, TReturn, TNext> = {
        next:              async (...args) => mapIR(await g.next(...args)),
        throw:  g.throw  ? async (...args) => mapIR(await g.throw!(...args)) : undefined,
        return: g.return ? async (...args) => g.return!(...args) as Promise<IteratorResult<R, TReturn>>: undefined,

        [Symbol.asyncIterator]: () => ag,
    }

    return ag;
}

export function unblocked<T, TReturn, TNext>(it: AsyncGenerator<T, TReturn, TNext>, timeout: number): AsyncGenerator<T | undefined, TReturn, TNext>;
export function unblocked<T, TReturn, TNext>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, timeout: number): ExtAsyncIterableIterator<T | undefined, TReturn, TNext>;
export function unblocked<T, TReturn, TNext>(it: AsyncIterator<T, TReturn, TNext> | AsyncIterable<T>, timeout: number): ExtAsyncIterableIterator<T | undefined, TReturn, TNext> {
    let next: Promise<IteratorResult<T, TReturn>> | undefined = undefined;

    const g = isAsyncIterable<T>(it) ? it[Symbol.asyncIterator]() as AsyncIterator<T, TReturn, TNext> : it;

    const ag: ExtAsyncIterableIterator<T | undefined, TReturn, TNext> = {
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
