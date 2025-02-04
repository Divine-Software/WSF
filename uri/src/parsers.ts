import { BasicTypes, isAsyncIterable, isHTML, isJSON, isReadableStream, isXML, toAsyncIterable, toReadableStream } from '@divine/commons';
import { ContentType } from '@divine/headers';
import iconv from 'iconv-lite';
import { Readable } from 'stream';
import { Finalizable, IOError, NULL, URI, VOID } from './uri';

/**
 * Converts a primitive value to an object and returns objects as-is.
 *
 * `undefined` will be converted to Object({@link VOID}) and `null` to Object({@link NULL}). Any other non-object value
 * will be converted via Object(value), which means that a `string` value will become a String object, a `number` will
 * become a Number instance, et cetera.
 *
 * {@link toPrimitive} can be used to reverse this operation.
 *
 * @template T     The actual type returned.
 * @param    value The value to convert to an object.
 * @returns        The value converted to an object.
 */
export function toObject<T extends object>(value: unknown): T {
    return value === undefined       ? Object(VOID) :
           value === null            ? Object(NULL) :
           typeof value !== 'object' ? Object(value) :
           value as T;
}

/**
 * Converts an object created by {@link toObject} back into the original value.
 *
 * @template T      The actual type returned.
 * @param    value  The object that should be converted back to its original value.
 * @returns         The original value.
 */
export function toPrimitive<T extends BasicTypes | symbol | undefined>(value: any): T {
    if (value !== null && value !== undefined) {
        value = value.valueOf();
    }

    return value === NULL ? null! : value === VOID ? undefined! : value;
}

/** An IOError subclass thrown by the {@link Parser} class. */
export class ParserError<D extends object = object> extends IOError<D> {
}

/**
 * The base class for all parser subclasses. Parsers can be constructed manually, but usually aren't. Instead, this
 * class provides the static methods {@link Parser.parse} and {@link Parser.serialize} (or
 * {@link Parser.serializeToBuffer}) for serialization/deserialization.
 *
 * Below is a list of all known parsers:
 *
 * Media type                          | Parser class
 * ------------------------------------|----------------------
 * `application/*+json`                | {@link JSONParser}
 * `application/*+xml`                 | {@link @divine/uri-x4e-parser!XMLParser}
 * `application/json`                  | {@link JSONParser}
 * `application/octet-stream`          | {@link BufferParser}
 * `application/toml`                  | {@link TOMLParser}
 * `application/vnd.esxx.octet-stream` | {@link PassThroughParser}
 * `application/x-www-form-urlencoded` | {@link FormParser}
 * `application/x-yaml`                | {@link YAMLParser}
 * `application/xml`                   | {@link @divine/uri-x4e-parser!XMLParser}
 * `application/yaml`                  | {@link YAMLParser}
 * `message/*`                         | {@link MessageParser}
 * `multipart/*`                       | {@link MultiPartParser}
 * `text/csv`                          | {@link CSVParser}
 * `text/event-stream`                 | {@link EventStreamParser}
 * `text/html`                         | {@link @divine/uri-x4e-parser!HTMLParser}
 * `text/plain`                        | {@link StringParser}
 * `text/tab-separated-values`         | {@link CSVParser}
 * `text/tsv`                          | {@link CSVParser}
 * `text/vnd.yaml`                     | {@link YAMLParser}
 * `text/x-yaml`                       | {@link YAMLParser}
 * `text/xml`                          | {@link @divine/uri-x4e-parser!XMLParser}
 * `text/yaml`                         | {@link YAMLParser}
 *
 */
export abstract class Parser {
    readonly contentType: ContentType;

    /**
     * Registers a new parser/serializer. All subclasses must register their MIME media type support with this method.
     *
     * @param type    The content/media type the parser can handle.
     * @param parser  The Parser subclass to register.
     * @returns       The Parser base class (for method chaining).
     */
    static register(type: string | RegExp, parser: typeof Parser): typeof Parser {
        Parser._parsers.set(type, parser);
        return Parser;
    }

    /**
     * Parses a given string, Buffer or byte stream using a parser registered for a specific media type.
     *
     * NOTE: This method *always returns an object*. Primitives are never returned. This means that text, for instance
     * will be returned as a String object, `null` as Object({@link NULL}) and `undefined` as Object({@link VOID}). You
     * may use {@link toPrimitive} to return the original value, or use `.valueOf()` and test the result against the
     * {@link NULL} and {@link VOID} symbols.
     *
     * @template T            The type of the returned object.
     * @param    stream       The source that should be parsed.
     * @param    contentType  The media type that specifies what parser to use.
     * @throws   ParserError  On parser errors or if the media type is not recognized.
     * @returns               An *object* (always an object) that represents the original source after parsing. It's
     *                        possible that the Parser subclass allocated temporary resources as part of the process.
     *                        These resources may be cleaned up by calling {@link FINALIZE}.
     */
    static async parse<T extends object>(stream: string | Buffer | AsyncIterable<Buffer | string>, contentType: ContentType | string): Promise<T & Finalizable> {
        try {
            const result = await Parser._create(ContentType.create(contentType)).parse(toAsyncIterable(stream));

            // Never return primitive types or null/undefined
            return await toObject(result);
        }
        catch (err) {
            throw err instanceof ParserError ? err : new ParserError(`${contentType} parser failed`, err);
        }
    }

    /**
     * Converts a parsed (or manually constructed) object back into a byte stream representation.
     *
     * Buffers and ReadableStream will be passed through as-is. Strings will just be encoded using the `charset` param
     * from `contentType` (or UTF-8 if not present). Everything else is serialized using a Parser subclass.
     *
     * @template T            The type of the object that is to be serialized.
     * @param    data         The object that is to be serialized.
     * @param    contentType  The media type that specifies what parser to use.
     * @throws   ParserError  On serialization errors or if the media type is not recognized.
     * @returns               A tuple containing the Buffer/byte stream and the actual media type. Note that the parser
     *                        may return a slightly different media type than was given (for instance,
     *                        {@link MultiPartParser} might add a boundary param if none was given).
     */
    static serialize<T = unknown>(data: T, contentType?: ContentType | string): [Buffer | Readable & AsyncIterable<Buffer>, ContentType] {
        try {
            data = toPrimitive(data) as unknown as T; // Unpack values wrapped by toObject()

            contentType = ContentType.create(contentType,
                data instanceof Buffer        ? ContentType.bytes :
                isReadableStream(data)        ? ContentType.bytes :
                isJSON(data) || data === null ? ContentType.json :
                isHTML(data)                  ? ContentType.html :
                isXML(data)                   ? ContentType.xml :
                ContentType.text);

            // 1. Pass Buffer and ReadableStream right through, ignoring `contentType`; URIs will be load()'ed and passed as-is
            // 2. Encode strings using 'charset' param from `contentType`
            // 3. Serialize everything else

            const dataOrParser =
                data instanceof Buffer     ? data :
                data instanceof URI        ? toReadableStream(data) : // AsyncIterable<Buffer>           => Readble<Buffer>
                isReadableStream(data)     ? toReadableStream(data) : // ReadableStream<Buffer | string> => Readble<Buffer>
                typeof data === 'string'   ? new StringParser(contentType)
                                           : Parser._create(contentType);

            if (dataOrParser instanceof Parser) {
                const serialized = dataOrParser.serialize(data);

                // Give Parser a chance to update content-type (for instance, MultiPartParser might add a boundary param)
                return [ serialized instanceof Buffer ? serialized : toReadableStream(serialized), dataOrParser.contentType ];
            }
            else {
                return [ dataOrParser, contentType];
            }
        }
        catch (err) {
            throw err instanceof ParserError ? err : new ParserError(`${contentType} serializer failed`, err);
        }
    }

    /**
     * Converts a parsed (or manually constructed) object into a Buffer.
     *
     * This is a convenience method that just invokes {@link parse} and then converts the byte stream into a single
     * Buffer.
     *
     * @param    data         The object that is to be serialized.
     * @param    contentType  The media type that specifies what parser to use.
     * @throws   ParserError  On serialization errors or if the media type is not recognized.
     * @returns               A tuple containing the Buffer and the actual media type. Note that the parser may return a
     *                        slightly different media type than was given (for instance, {@link MultiPartParser} might
     *                        add a boundary param if none was given).
     */
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
            throw new ParserError(`Parser ${contentType.type} not available`, undefined, contentType);
        }

        return new (parserClass as any)(contentType);
    }

    /**
     * Constructs a new Parser instance.
     *
     * @param contentType The media type this parser object was instanciated for.
     */
    constructor(contentType: ContentType | string) {
        this.contentType = ContentType.create(contentType);
    }

    /**
     * Parses a stream and returns the result as a parser-specific representation.
     *
     * This method must be implemented by the actual subclass.
     *
     * @param  stream       The stream to parse.
     * @throws ParserError  On parser errors.
     * @returns             The parsed stream.
     */
    abstract parse(stream: AsyncIterable<Buffer>): Promise<unknown>;

    /**
     * Serializes a parsed or manually constructed object back into a Buffer or byte stream.
     *
     * This method must be implemented by the actual subclass.
     *
     * @param  data         A parser-specific representation that is to be serialized.
     * @throws ParserError  On serialization errors.
     * @returns             A Buffer or a byte stream.
     */
    abstract serialize(data: unknown): Buffer | AsyncIterable<Buffer>;

    /**
     * A helper method used by parser subclasses to report invalid input.
     *
     * @param condition  Must be `true`, or else a {@link ParserError} will be raised.
     * @param data       Some kind of extra information that will be provided in {@link ParserError.data}.
     * @param cause      If this error was caused by some other kind of failure, the original error will be available as
     *                   {@link ParserError.cause}.
     */
    protected _assertSerializebleData(condition: boolean, data: unknown, cause?: Error | unknown): asserts condition {
        if (!condition) {
            const type = data instanceof Object ? Object.getPrototypeOf(data).constructor.name : data === null ? 'null' : typeof data;

            throw new ParserError(`${this.constructor.name} cannot serialize ${type} as ${this.contentType.type}`, cause, toObject(data));
        }
    }
}

/**
 * The `application/octet-stream` parser just concatenates all bytes in the byte stream into a single Buffer.
 */
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

/**
 * The `application/vnd.esxx.octet-stream` parser is a no-op parser that provides access to the original byte stream.
 * Unlike {@link BufferParser} it will not concatenate the byte stream into a single Buffer but will pass the bytes
 * along as they arrive.
 */
export class PassThroughParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<AsyncIterable<Buffer>> {
        return stream;
    }

    serialize(data: Buffer | AsyncIterable<Buffer>): Buffer | AsyncIterable<Buffer> {
        return data;
    }
}

/**
 * The `text/plain` parser converts between text and bytes. It is also used by many other string-based parsers to
 * convert between strings and byte streams.
 *
 * The following media type parameters are used:
 *
 * Name          | Description
 * --------------|----------------------------------------------------------------------------------------------------
 * `charset`     | The character set to use. Default is `utf8`.
 * `x-bom`       | Whether to add a byte-order-mark (if `present`) or not (if `absent`, the default) when serializing.
 */
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
