/* eslint-disable jsdoc/require-jsdoc */

import { EventEmitter } from 'events';
import { pipeline, Readable } from 'stream';
import { toAsyncIterable } from './async-iterable';

export function isReadableStream(obj: any): obj is NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
export function isReadableStream(obj: NodeJS.ReadableStream): boolean {
    return obj instanceof EventEmitter && typeof obj.readable === 'boolean' && typeof obj.read === 'function';
}

export function toReadableStream(data: string | Buffer | AsyncIterable<Buffer | string>): Readable & AsyncIterable<Buffer>{
    return Readable.from(toAsyncIterable(data));
}

export function copyStream(from: NodeJS.ReadableStream, to: NodeJS.WritableStream): Promise<typeof to> {
    return new Promise<typeof to>((resolve, reject) => {
        pipeline(from, to, (err) => err ? reject(err) : resolve(to));
    });
}
