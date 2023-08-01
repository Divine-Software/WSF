import { isAsyncIterable, toAsyncIterable, toReadableStream } from '@divine/commons';
import { Readable, Transform } from 'stream';
import { createBrotliCompress, createBrotliDecompress, createDeflate, createGunzip, createGzip, createInflate } from 'zlib';
import { IOError } from './uri';

/** An IOError subclass thrown by the {@link Encoder} class. */
export class EncoderError extends IOError {
}

/**
 * The base class for all encoder subclasses. Encoders can be constructed manually, but usually aren't. Instead, this
 * class provides the static methods {@link Encoder.encode} and {@link Encoder.decode}.
 *
 * Encoders transform byte streams and are used, among other things, to handle the `content-encoding`,
 * `content-transfer-encoding` and `transfer-encoding` headers in MIME and HTTP.
 *
 * Below is a list of all known encoders:
 *
 * Encoding           | Encoder class
 * -------------------|---------------------------
 * `7bit`             | {@link IdentityEncoder}
 * `8bit`             | {@link IdentityEncoder}
 * `base64`           | {@link Base64Encoder}
 * `base64url`        | {@link Base64Encoder}
 * `binary`           | {@link IdentityEncoder}
 * `br`               | {@link ZlibEncoder}
 * `deflate`          | {@link ZlibEncoder}
 * `gzip`             | {@link ZlibEncoder}
 * `identity`         | {@link IdentityEncoder}
 * `quoted-printable` | {@link QuotedPrintableEncoder}
 * `x-gzip`           | {@link ZlibEncoder}
 */
export abstract class Encoder {
    readonly type: string

    /**
     * Registers a new encoder. All subclasses must register their encoding type support with this method.
     *
     * @param type    The encoding format the encoder can handle.
     * @param encoder The Encoder subclass to register.
     * @returns       The Encoder base class (for method chaining).
     */
     static register(type: string, encoder: typeof Encoder): typeof Encoder {
        Encoder._encoders.set(type, encoder);
        return Encoder;
    }

    /**
     * Encodes the provided stream using one or more encoders.
     *
     * @param  stream        The data to encode. If a string, it will first converted to UTF-8.
     * @param  types         An encoding format or an ordered list of encoding formats to apply to the stream. A list
     *                       may either be a comma-separated string or an array of strings.
     * @throws EncoderError  On encoding errors or if the encoding format is not recognized.
     * @returns              An encoded byte stream.
     */
    static encode(stream: string | Buffer | AsyncIterable<Buffer>, types: string | string[]): Readable & AsyncIterable<Buffer> {
        stream = isAsyncIterable(stream) ? stream : toAsyncIterable(stream);
        types  = typeof types === 'string' ? types.trim().split(/\s*,\s*/) : types;

        try {
            for (const type of types) {
                stream = Encoder._create(type).encode(stream);
            }

            return toReadableStream(stream);
        }
        catch (err) {
            throw err instanceof EncoderError ? err : new EncoderError(`'${types}' encoder failed`, err);
        }
    }

    /**
     * Decodes the provided stream using one or more encoders.
     *
     * @param  stream        The data to encode. If a string, it will first converted to UTF-8.
     * @param  types         An encoding format or an ordered list of encoding formats to apply (in reverse!) to the
     *                       stream.  A list may either be a comma-separated string or an array of strings.
     * @throws EncoderError  On decoding errors or if the encoding format is not recognized.
     * @returns              An encoded byte stream.
     */
    static decode(stream: string | Buffer | AsyncIterable<Buffer>, types: string | string[]): Readable & AsyncIterable<Buffer> {
        stream = isAsyncIterable(stream) ? stream : toAsyncIterable(stream);
        types  = typeof types === 'string' ? types.trim().split(/\s*,\s*/) : types;

        try {
            for (const type of types.reverse()) {
                stream = Encoder._create(type).decode(stream);
            }

            return toReadableStream(stream);
        }
        catch (err) {
            throw err instanceof EncoderError ? err : new EncoderError(`'${types}' encoder failed`, err);
        }
    }

    private static _encoders = new Map<string, typeof Encoder>();

    private static _create(type: string): Encoder {
        const encoder = Encoder._encoders.get(type.toLowerCase());

        if (encoder) {
            return new (encoder as any)(type);
        }
        else {
            throw new EncoderError(`Encoder '${type}' not available`);
        }
    }

    /**
     * Constructs a new Encoder instance.
     *
     * @param type The encoding format this encoder object was instanciated for.
     */
    constructor(type: string) {
        this.type = type.toLowerCase();
    }

    /**
     * Encodes the provided byte stream into an new byte stream.
     *
     * This method must be implemented by the actual subclass.
     *
     * @param  stream        The stream to encode.
     * @throws EncoderError  On encoding errors.
     * @returns              The encoded stream.
     */
    abstract encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer>;

    /**
     * Decodes the provided byte stream into an new byte stream.
     *
     * This method must be implemented by the actual subclass.
     *
     * @param  stream        The stream to decode.
     * @throws EncoderError  On decoding errors.
     * @returns              The decoded stream.
     */
     abstract decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer>;
}

/**
 * The `7bit`, `8bit`, `binary` and `identity` encoder just passes the provided byte stream through as-is.
 */
export class IdentityEncoder extends Encoder {
    async *encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        yield *stream;
    }

    async *decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        yield *stream;
    }
}

/**
 * The `quoted-printable` encoder applies or removes the
 * [Quoted-Printable](https://tools.ietf.org/html/rfc2045#section-6.7) encoding to the provided byte stream.
 */
export class QuotedPrintableEncoder extends Encoder {
    private static readonly _hexEncoded = [...Array(256)].map((_, i) => '=' + (0x100 + i).toString(16).substr(1).toUpperCase());
    private _lineLength = 76;

    async *encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        const encodeLine = (line: string, crlf: boolean) => {
            let result = '';
            let offset = 0;

            line = line.replace(/([^\t !-<>-~])/g, (_, c: string) => QuotedPrintableEncoder._hexEncoded[c.charCodeAt(0)]); // Rule #1, #2

            while (offset < line.length) {
                let chars = Math.min(this._lineLength - 1 /* Make room for soft line break */, line.length - offset);

                // Don't break escape sequence
                if (line[offset + chars - 1] === '=') {
                    chars -= 1;
                }
                else if (line[offset + chars - 2] === '=') {
                    chars -= 2;
                }

                const soft = offset + chars < line.length || /[\t ]$/.test(line); // Rule #3, #5

                result += line.substr(offset, chars) + (soft ? '=\r\n' : '');
                offset += chars;
            }

            return result + (crlf ? '\r\n' : '');
        };

        let extra = '';

        for await (const chunk of stream) {
            const lines = (extra + chunk.toString('binary')).split(/\r\n/); // Rule #4
            extra = lines.pop() ?? '';

            yield Buffer.from(lines.map((line) => encodeLine(line, true)).join(''), 'binary');
        }

        if (extra !== '') {
            yield Buffer.from(encodeLine(extra, false), 'binary');
        }
    }

    async *decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        const decodeLine = (line: string, crlf: boolean) => {
            line = line.trimEnd(); // Rule #3
            line = line.endsWith('=') ? line.substring(0, line.length - 1) : line + (crlf ? '\r\n' : ''); // Rule #5

            return line.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
                return String.fromCharCode(parseInt(hex, 16)); // Rule #1, #2
            });
        };

        let extra = '';

        for await (const chunk of stream) {
            const lines = (extra + chunk.toString('binary')).split(/\r?\n/); // Rule #4 (but allow single \n as well)
            extra = lines.pop() ?? '';

            yield Buffer.from(lines.map((line) => decodeLine(line, true)).join(''), 'binary');
        }

        if (extra !== '') {
            yield Buffer.from(decodeLine(extra, false), 'binary');
        }
    }
}

/**
 * The `base64` and `base64url` encoder applies or removes the [Base64](https://datatracker.ietf.org/doc/html/rfc4648)
 * encodings to the provided byte stream. When encoding, lines will never be wider than 64 characters.
 */
 export class Base64Encoder extends Encoder {
    private _lineLength = 64; /* Be both PEM- and MIME-compatible */
    private _lineEnding = '\r\n';

    async *encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        let length = 0;

        const splitLines = (data: string, final: boolean): Buffer => {
            let result = '';
            let offset = 0;

            while (offset < data.length) {
                const chars = Math.min(this._lineLength - length, data.length - offset);

                result += data.substr(offset, chars);
                offset += chars;
                length += chars;

                if (length === this._lineLength) {
                    length  = 0;
                    result += this._lineEnding;
                }
            }

            if (length !== this._lineLength && final) {
                result += this._lineEnding;
            }

            return Buffer.from(result, 'binary');
        };

        let extra = Buffer.alloc(0);

        for await (const chunk of stream) {
            const buffer = extra.length ? Buffer.concat([extra, chunk]) : chunk;
            const length = buffer.length - buffer.length % 3;
            extra = buffer.slice(length);

            yield splitLines(buffer.slice(0, length).toString('base64'), false);
        }

        if (extra.length) {
            yield splitLines(extra.toString('base64'), true);
        }
    }

    async *decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        let extra = '';

        for await (const chunk of stream) {
            const base64 = extra + chunk.toString('binary').replace(/[^0-9A-Za-z+/_-]/g, '');
            const length = base64.length - base64.length % 4;
            extra = base64.substring(length);

            yield Buffer.from(base64.substring(0, length), 'base64');
        }

        if (extra.length) {
            yield Buffer.from(extra, 'base64');
        }
    }
}

/**
 * The `br`, `gzip`, `x-gzip` and `deflate` encoder applies or removes various zlib-related encodings to the provided
 * byte stream.
 */
export class ZlibEncoder extends Encoder {
    encode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        switch (this.type) {
            case 'br':      return this._transform(stream, createBrotliCompress());
            case 'gzip':    return this._transform(stream, createGzip());
            case 'x-gzip':  return this._transform(stream, createGzip());
            case 'deflate': return this._transform(stream, createDeflate());
            default:        throw new TypeError(`Unsupported compression type '${this.type}'`);
        }
    }

    decode(stream: AsyncIterable<Buffer>): AsyncIterable<Buffer> {
        switch (this.type) {
            case 'br':      return this._transform(stream, createBrotliDecompress());
            case 'gzip':    return this._transform(stream, createGunzip());
            case 'x-gzip':  return this._transform(stream, createGunzip());
            case 'deflate': return this._transform(stream, createInflate());
            default:        throw new TypeError(`Unsupported compression type '${this.type}'`);
        }
    }

    private async *_transform(stream: AsyncIterable<Buffer>, transform: Transform) {
        yield* toReadableStream(stream).pipe(transform);
    }
}

Encoder
    .register('7bit',             IdentityEncoder)
    .register('8bit',             IdentityEncoder)
    .register('base64',           Base64Encoder)
    .register('base64url',        Base64Encoder)
    .register('binary',           IdentityEncoder)
    .register('br',               ZlibEncoder)
    .register('deflate',          ZlibEncoder)
    .register('gzip',             ZlibEncoder)
    .register('identity',         IdentityEncoder)
    .register('quoted-printable', QuotedPrintableEncoder)
    .register('x-gzip',           ZlibEncoder)
;
