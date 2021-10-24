import { BasicTypes, isAsyncIterable, isDOMNode, isJSON, toAsyncIterable } from '@divine/commons';
import { ContentType } from '@divine/headers';
import iconv from 'iconv-lite';
import { Finalizable, IOError, NULL, VOID } from './uri';

export function toObject<T extends object>(result: unknown): T {
    return result === undefined       ? Object(VOID) :
           result === null            ? Object(NULL) :
           typeof result !== 'object' ? Object(result) :
           result;
}

export function toPrimitive(value: any): BasicTypes | symbol | undefined {
    if (value !== null && value !== undefined) {
        value = value.valueOf();
    }

    return value === NULL ? null : value === VOID ? undefined : value;
}

export class ParserError extends IOError {
}

export abstract class Parser {
    static register(baseType: string | RegExp, parser: typeof Parser): typeof Parser {
        Parser._parsers.set(baseType, parser);
        return Parser;
    }

    static async parse<T extends object>(stream: string | Buffer | AsyncIterable<Buffer>, contentType: ContentType | string): Promise<T & Finalizable> {
        try {
            const result = await Parser._create(ContentType.create(contentType)).parse(toAsyncIterable(stream));

            // Never return primitive types or null/undefined
            return toObject(result);
        }
        catch (err) {
            throw new ParserError(`${contentType} parser failed`, err);
        }
    }

    static serialize<T = unknown>(data: T, contentType?: ContentType | string): [Buffer | AsyncIterable<Buffer>, ContentType] {
        try {
            data = toPrimitive(data) as unknown as T; // Unpack values wrapped by toObject()

            contentType = ContentType.create(contentType,
                data instanceof Buffer        ? ContentType.bytes :
                isAsyncIterable(data)         ? ContentType.bytes :
                isJSON(data) || data === null ? ContentType.json :
                isDOMNode(data)               ? ContentType.xml :
                ContentType.text);

            // 1. Pass Buffer and ReadableStream right through, ignoring `contentType`; URIs will be load()'ed and passed as-is
            // 2. Encode strings using 'charset' param from `contentType`
            // 3. Serialize everything else

            const dataOrParser =
                data instanceof Buffer          ? data :
                isAsyncIterable<Buffer>(data)   ? toAsyncIterable(data) :
                typeof data === 'string'        ? new StringParser(contentType)
                                                : Parser._create(contentType);

            if (dataOrParser instanceof Parser) {
                // Give Parser a chance to update content-type (for instance, MultiPartParser might add a boundary param)
                return [ dataOrParser.serialize(data), dataOrParser.contentType ];
            }
            else {
                return [ dataOrParser, contentType];
            }
        }
        catch (err) {
            throw new ParserError(`${contentType} serializer failed`, err);
        }
    }

    static async serializeToBuffer<T = unknown>(data: T, contentType?: ContentType | string): Promise<[Buffer, ContentType]> {
        const [ stream, ct ] = Parser.serialize(data, contentType);

        return [ await Parser.parse<Buffer>(stream, ContentType.bytes), ct ];
    }

    private static _parsers = new Map<string | RegExp, typeof Parser>();

    private static _create(contentType: ContentType): Parser {
        let parserClass = Parser._parsers.get(contentType.type);

        if (!parserClass) {
            for (const [type, ctor] of Parser._parsers) {
                if (type instanceof RegExp && type.test(contentType.type)) {
                    parserClass = ctor;
                }
            }
        }

        if (!parserClass) {
            throw new ParserError(`No parser availble for this type`, undefined, contentType);
        }

        return new (parserClass as any)(contentType);
    }

    constructor(readonly contentType: ContentType) { }
    abstract parse(stream: AsyncIterable<Buffer>): Promise<unknown>;
    abstract serialize(data: unknown): Buffer | AsyncIterable<Buffer>;

    protected _assertSerializebleData(condition: boolean, data: unknown, cause?: Error): asserts condition {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new ParserError(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.type}`, cause, toObject(data));
        }
    }
}

export class BufferParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Buffer> {
        const chunks = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }

    serialize(data: string | Buffer | AsyncIterable<Buffer>): Buffer | AsyncIterable<Buffer> {
        this._assertSerializebleData(typeof data === 'string' || data instanceof Buffer || isAsyncIterable(data), data);

        return data instanceof Buffer ? data : toAsyncIterable(data);
    }
}

export class PassThroughParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<AsyncIterable<Buffer>> {
        return stream;
    }

    serialize(data: Buffer | AsyncIterable<Buffer>): Buffer | AsyncIterable<Buffer> {
        return data;
    }
}

export class StringParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<string> {
        const charset = this.contentType.param('charset', 'utf8');
        const bom     = this.contentType.param('x-bom',   'absent');
        const chunks  = [];

        for await (const chunk of stream) {
            // FIXME: This does not work if chunk ends in the middle of a character
            chunks.push(iconv.decode(chunk, charset, { stripBOM: chunks.length === 0 && bom === 'absent' }));
        }

        return chunks.join('');
    }

    serialize(data: unknown): Buffer {
        const charset = this.contentType.param('charset', 'utf8');
        const bom     = this.contentType.param('x-bom',   'absent');
        this._assertSerializebleData(data !== null && data !== undefined, data);

        return iconv.encode(String(data), charset, { addBOM: bom === 'present'});
    }
}

Parser
    .register('application/octet-stream',          BufferParser)
    .register('application/vnd.esxx.octet-stream', PassThroughParser)
    .register('text/plain',                        StringParser)
;
