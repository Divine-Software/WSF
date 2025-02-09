import { EventEmitter } from 'events';
import { pipeline, Readable, Transform, TransformCallback, TransformOptions } from 'stream';
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

export class SizeLimitedReadableStream extends Transform {
    private _count = 0;

    constructor(private _maxContentLength: number, private _makeError: () => Error, opts?: TransformOptions) {
        super(opts);
    }

    override _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void {
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

    override _flush(callback: TransformCallback): void {
        callback();
    }
}
