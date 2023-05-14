import { StringParams } from '@divine/commons';
import { ContentDisposition, ContentType } from '@divine/headers';
import { randomBytes } from 'crypto';
import Dicer from 'dicer';
import { Readable } from 'stream';
import { URLSearchParams } from 'url';
import { Encoder } from '../encoders';
import { Parser, StringParser } from '../parsers';
import { CacheURI } from '../protocols/cache';
import { FIELDS, Finalizable, FINALIZE, URI, WithFields } from '../uri';

/** A basic string key-value record. */
export interface FormData extends WithFields<FormField> {
    /** Both keys and values are strings. */
    [key: string]: string | undefined;
}

/** A basic string key-value field. */
export interface FormField {
    /** The name of the field. */
    name:        string;

    /** The value of the field. */
    value:       string;
}

/** A multi-part key-value record. */
export interface MultiPartData extends WithFields<MultiPartField>, Finalizable {
    /** Like {@link FormData}, keys are strings but the value may be files and {@link MultiPartData} as well. */
    [key: string]: string | URI | MultiPartData;
}

/** A multi-part key-value field. */
export interface MultiPartField {
    /** The name of the field. Note that the name is actually optional. */
    name?:        string;

    /** The media type of the value. */
    type:         ContentType;

    /** Multi-part keys may contain additional headers, available in this record. */
    headers:      StringParams;

    /** The value of the filed. */
    value:        string | URI | MultiPartData;
}

/** A MIME message. */
export interface MimeMessage extends Finalizable {
    /** The media type of the value. */
    type:    ContentType,

    /** MIME messages may contain additional headers, available in this record. */
    headers: StringParams;

    /** The message body. */
    value:   string | URI | MimeMessage[];
}

/** A common interface compatible with {@link FormField}, {@link MultiPartField} and {@link MimeMessage}. */
export interface MimeMessageLike {
    /** MIME messages may contain additional headers, available in this record. */
    headers?: StringParams;

    /** The field value or message body. */
    value?:   string | URI | MimeMessage[] | MultiPartData | MultiPartField[];
}

function makeBoundary() {
    return '---=__' + randomBytes(48).toString('base64');
}

/**
 * The `application/x-www-form-urlencoded` parser uses URLSearchParams and {@link StringParser} to handle URL HTML
 * forms.
 *
 * The parsed data is a {@link FormData} object, with the key-value pairs available via {@link FIELDS}.
 */
export class FormParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<FormData> {
        const params = new URLSearchParams(await new StringParser(this.contentType).parse(stream));
        const result: FormData = {
            [FIELDS]: [...params.entries()].map(([name, value]) => ({ name, value }))
        };

        for (const [name, value] of params.entries()) {
            result[name] ??= value;
        }

        return result;
    }

    serialize(data: FormData | FormField[]): Buffer {
        this._assertSerializebleData(data && typeof data === 'object' || data?.[FIELDS] && Array.isArray(data?.[FIELDS]), data);

        const entries = (Array.isArray(data) ? data : data[FIELDS])?.map<[string, string]>((f) => [f.name, f.value])
            ?? Object.fromEntries(Object.entries(data)) /* Remove symbols */;

        return new StringParser(this.contentType).serialize(new URLSearchParams(entries));
    }
}

/**
 * The `message/*` parser handles all kinds of messages, including `message/rfc822`.
 *
 * The parsed data is a {@link MimeMessage}, but the serializer can handle any {@link MimeMessageLike} object.
 */
export class MessageParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<MimeMessage> {
        async function *wrappedStream(boundary: string): AsyncIterable<Buffer> {
            yield Buffer.from(`\r\n--${boundary}\r\n`);
            yield* stream;
            yield Buffer.from(`\r\n--${boundary}--\r\n`);
        }

        function isMultiPartData(data: string | URI | MultiPartData): data is MultiPartData {
            return Array.isArray((data as any)?.[FIELDS]);
        }

        function multiPartToMime(data: MultiPartData): MimeMessage[] {
            return data[FIELDS]!.map((field) => ({
                type:    field.type,
                headers: field.headers,
                value:   isMultiPartData(field.value) ? multiPartToMime(field.value) : field.value,
            }));
        }

        // Fake a multipart message and use the MultiPartParser to parse the data, then convert to MimeMessage
        const boundary  = makeBoundary();
        const formType  = new ContentType('multipart/*').setParam('boundary', boundary);
        const multipart = await new MultiPartParser(formType).parse(wrappedStream(boundary));
        const messages  = multiPartToMime(multipart);

        return { ...messages[0], [FINALIZE]: multipart[FINALIZE] }
    }

    async *serialize(data: MimeMessageLike): AsyncIterable<Buffer> {
        this._assertSerializebleData(data && typeof data === 'object' || data?.[FIELDS] && Array.isArray(data?.[FIELDS]), data);

        // Serialize first, to give Parser a chance to update the content-type
        const value = (data.value as MultiPartData)?.[FIELDS] ?? data.value;
        const [ stream, contentType ] = value !== undefined ? Parser.serialize(value, data.headers?.['content-type']) : [];

        const headers = [
            ...Object.entries({ ...data.headers, 'content-type': data.headers?.['content-type'] && contentType })
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${k}: ${String(v)}`), // FIXME: we should probably handle folding and escape illegal characters here ...
            '',
            ''
        ].join('\r\n');

        yield Buffer.from(headers);

        if (stream) {
            yield* Encoder.encode(stream, data.headers?.['content-transfer-encoding'] ?? []);
        }
    }
}

interface DicerHeaders {
    [key: string]: string[] | undefined;
}

/**
 * The `multipart/*` parser handles MIME multipart messages and `multipart/form-data` HTML forms.
 *
 * The parsed data is an {@link MultiPartData} object, but and array of {@link MultiPartField} objects may also be
 * serialized by this parser.
 *
 * Files will be copied and wrapped as {@link CacheURI} objects. These temporary files can be removed by calling the
 * {@link FINALIZE} function.
 */
export class MultiPartParser extends Parser {
    static defaultContentType = ContentType.text;

    async parse(stream: AsyncIterable<Buffer>): Promise<MultiPartData> {
        const boundary = this.contentType.param('boundary');
        const values: Array<Promise<MultiPartField>> = [];
        const finalizers: Array<() => Promise<unknown>> = [];

        const saveToCache = async (type: ContentType, stream: AsyncIterable<Buffer>) => {
            const uri = CacheURI.create(type);

            finalizers.push(() => uri.remove().catch(() => { /* Ignore */ }));
            await uri.save(stream, ContentType.bytes);

            return uri;
        };

        const isParsableType = (type: ContentType) => type.baseType === 'multipart' || type.baseType === 'message' || type.type === 'text/plain';

        // Cannot use copyStream/pipeline because Dicer might not emit 'end'
        await new Promise<void>((resolve, reject) => Readable.from(stream).pipe(new Dicer({ boundary })
            .on('error', (err) => {
                reject(err);
            })
            .on('finish', () => {
                resolve();
            })
            .on('part', (part) => {
                let partFailed = true;

                const stream = part.on('header', (rawHeaders: DicerHeaders) => {
                    partFailed = false;

                    // eslint-disable-next-line no-async-promise-executor
                    values.push(new Promise(async (resolve, reject) => {
                        try {
                            const headers     = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k, v?.join(', ')]));
                            const type        = ContentType.create(headers['content-type'], MultiPartParser.defaultContentType);
                            const disposition = headers['content-disposition'] && new ContentDisposition(headers['content-disposition']) || undefined;
                            const name        = disposition?.param('name');
                            const parse       = disposition?.type === 'form-data' && disposition?.filename === undefined ||
                                                disposition?.type !== 'form-data' && isParsableType(type);
                            let value: string | URI | MultiPartData;
                            const data: AsyncIterable<Buffer> = Encoder.decode(stream, headers['content-transfer-encoding'] ?? []);

                            if (parse) {
                                const parsed = await Parser.parse(data, type);

                                if (parsed[FINALIZE]) {
                                    finalizers.push(parsed[FINALIZE]!);
                                }

                                value = parsed.valueOf() as string | MultiPartData;
                            }
                            else {
                                value = await saveToCache(type, data);
                            }

                            resolve({ name, type, headers, value });
                        }
                        catch (err) {
                            reject(err);
                        }
                    }));
                })
                .on('end', () => {
                    if (partFailed) {
                        values.push(Promise.reject(new Error(`Missing headers`)));
                    }
                })
            })
        ));

        const result: MultiPartData = {
            [FIELDS]:   await Promise.all(values),
            [FINALIZE]: () => Promise.all(finalizers.map(f => f())),
        };

        for (const field of result[FIELDS]!) {
            if (field.name !== undefined) {
                result[field.name] ??= field.value;
            }
        }

        return result;
    }

    serialize(data: MultiPartData | MultiPartField[]): AsyncIterable<Buffer> {
        // Ensure we always have a valid boundary once this method returns!
        this.contentType.setParam('boundary', this.contentType.param('boundary') ?? makeBoundary());

        return this._serialize(data);
    }

    private async *_serialize(data: MultiPartData | MultiPartField[]): AsyncIterable<Buffer> {
        this._assertSerializebleData(data && typeof data === 'object' || Array.isArray(data?.[FIELDS]), data);

        const type     = MultiPartParser.defaultContentType;
        const headers  = {};
        const entries  = Array.isArray(data) ? data : data[FIELDS]
                         ?? Object.entries(data).map(([name, value]) => ({ name, value, type, headers }));
        const message  = new ContentType('message/*');
        const boundary = this.contentType.param('boundary')!;

        for (const entry of entries) {
            yield Buffer.from(`\r\n--${boundary}\r\n`);
            yield* new MessageParser(message).serialize(entry);
        }

        yield Buffer.from(`\r\n--${boundary}--\r\n`);
    }
}

Parser
    .register('application/x-www-form-urlencoded', FormParser)
    .register(/^message\/.*/,                      MessageParser)
    .register(/^multipart\/.*/,                    MultiPartParser)
;
