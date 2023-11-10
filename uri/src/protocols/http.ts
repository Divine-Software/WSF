import { copyStream, StringParams } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { Agent, IncomingMessage, request as requestHTTP } from 'http';
import { request as requestHTTPS } from 'https';
import path from 'path';
import { Readable } from 'stream';
import { SecureContextOptions } from 'tls';
import { URL } from 'url';
import pkg from '../../package.json';
import { Encoder } from '../encoders';
import { Parser } from '../parsers';
import { URIParams } from '../selectors';
import { DirectoryEntry, HEADERS, IOError, Metadata, ParamsSelector, STATUS, STATUS_TEXT, URI, VOID } from '../uri';

/** HTTP configuration parameters. */
export interface HTTPParams extends URIParams {
    /** Agent to use for connection pooling. */
    agent?: Agent;

    /** The maximum number of 3xx redirects to allow before a request is cancelled. */
    maxRedirects?: number;

    /** The request timeout. */
    timeout?: number;

    /** SSL/TLS parameters. */
    tls?: SecureContextOptions & {
        /** If `false`, allow servers not in CA list. Default is `true`. */
        rejectUnauthorized?: boolean;

        /** Override the SNI server name. Set to `''` to disable SNI. */
        servername?: string;
    }
}

/** Provides configuration parameters for {@link HTTPURI}. */
export interface HTTPParamsSelector extends ParamsSelector {
    params: HTTPParams;
}

/**
 * The `http:` and `https:` protocol handler is used to access web services.
 *
 * Redirects are handled automatically. To configure the handler, add an {@link HTTPParamsSelector} with
 * {@link addSelector}. You can also provide authentication with an {@link AuthSelector} and add custom headers with a
 * {@link HeadersSelector}.
 */
export class HTTPURI extends URI {
    /**
     * Issues a `HEAD` request and constructs a {@link DirectoryEntry} from the result.
     *
     * @throws IOError  On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @returns         Information about this HTTP resource, including {@link MetaData}.
     */
    override async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        const response = await this._query<T>('HEAD', {}, undefined, undefined, undefined);
        const headers  = response[HEADERS]!;
        const location = new URI(headers['content-location'] ?? '', this);
        const length   = headers['content-length'];
        const type     = headers['content-type'];
        const modified = headers['last-modified'];

        return this._requireValidStatus<DirectoryEntry>({
            ...extractMetadata(response),
            uri:     this,
            name:    path.posix.basename(location.pathname),
            type:    ContentType.create(type),
            length:  typeof length === 'string' ? Number(length) : undefined,
            updated: typeof modified === 'string' ? new Date(modified) : undefined,
        }) as T & Metadata;
    }


    /**
     * Issues a `GET` request and parses the result.
     *
     * @template T            The actual type returned.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to parse the resource.
     * @returns               The HTTP resource parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async load<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('GET', {}, undefined, undefined, recvCT));
    }

    /**
     * Issues a `PUT` request with a serialized payload and parses the result.
     *
     * @template T            The actual type returned.
     * @template D            The type of data to store.
     * @param    data         The data to store.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to serialize the payload or parse
     *                        the response.
     * @returns               The HTTP response parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async save<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('PUT', {}, data, sendCT, recvCT));
    }

    /**
     * Issues a `POST` request with a serialized payload and parses the result.
     *
     * @template T            The actual type returned.
     * @template D            The type of data to send.
     * @param    data         The data to send.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to serialize the payload or parse
     *                        the response.
     * @returns               The HTTP response parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async append<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('POST', {}, data, sendCT, recvCT));
    }

    /**
     * Issues a `PATCH` request with a serialized payload and parses the result.
     *
     * @template T            The actual type returned.
     * @template D            The type of the patch data.
     * @param    data         The patch data to send.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to serialize the payload or parse
     *                        the response.
     * @returns               The HTTP response parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async modify<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('PATCH', {}, data, sendCT, recvCT));
    }

    /**
     * Issues a `DELETE` request and parses the result.
     *
     * @template T            The actual type returned.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to parse the response.
     * @returns               The HTTP response parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async remove<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('DELETE', {}, undefined, undefined, recvCT));
    }

    /**
     * Issues a custom HTTP request, optionally with a serialized payload, and parses the result.
     *
     * @template T            The actual type returned.
     * @template D            The type of the patch data.
     * @param    method       The (case-sensitive) HTTP method to issue.
     * @param    headers      Custom headers to send, in addition to those specified via {@link HeadersSelector}.
     * @param    data         The data/payload to send.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Override the default response parser. Defaults to the `content-type` response header.
     * @throws   IOError      On I/O errors or if this the HTTP response status is outside the 200-299 range.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to serialize the payload or parse
     *                        the response.
     * @returns               The HTTP response parsed as `recvCT` *into an object*, including {@link MetaData}.
     */
    override async query<T extends object, D = unknown>(method: string, headers?: StringParams | null, data?: D, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        if (typeof method !== 'string') {
            throw new TypeError(`URI ${this}: query: 'method' argument missing/invalid`);
        }
        else if (headers !== undefined && !(headers instanceof Object)) {
            throw new TypeError(`URI ${this}: query: 'headers' argument missing/invalid`);
        }
        else if (sendCT !== undefined && !(sendCT instanceof ContentType) && typeof sendCT !== 'string') {
            throw new TypeError(`URI ${this}: query: 'sendCT' argument invalid`);
        }
        else if (recvCT !== undefined && !(recvCT instanceof ContentType) && typeof recvCT !== 'string') {
            throw new TypeError(`URI ${this}: query: 'recvCT' argument invalid`);
        }

        return this._requireValidStatus(await this._query(method, headers ?? {}, data, this._guessContentType(sendCT), recvCT));
    }

    /** @internal */
    protected _requireValidStatus<T extends object & Metadata>(result: T): T {
        const status = result[STATUS];

        if (status && (status < 200 || status >= 300)) {
            throw new IOError(`URI ${this} request failed: ${result[STATUS_TEXT]} [${status}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    /** @internal */
    private async _query<T>(method: string, headers: StringParams, data?: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T & Metadata> {
        let body: Buffer | AsyncIterable<Buffer> | undefined;

        headers = {
            'accept-encoding': 'gzip, deflate, br',
            'user-agent':      `Divine-URI/${pkg.version}`,
            ...this._getBestSelector(this.selectors.headers)?.headers,
            ...headers
        };

        if (data !== undefined) {
            const [serialized, contentType] = Parser.serialize(data, sendCT);

            headers = {
                'content-type':   contentType.toString(),
                'content-length': serialized instanceof Buffer ? serialized.length.toString() : undefined,
                ...headers
            };
            body = serialized;
        }

        if (!headers['authorization']) {
            headers['authorization'] = (await this._getAuthorization({ method, url: this, headers: Object.entries(headers)}, body))?.toString();
        }

        // Bug workaround?
        headers = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));

        const params  = this._getBestSelector<HTTPParamsSelector>(this.selectors.params)?.params ?? {};
        const options = { agent: params.agent, timeout: params.timeout };
        const request = async (method: string, url: string) => {
            const reqDesc = `URI ${this}: ${method} ${url === this.href ? '#' : url}`;
            const started = Date.now();
            const request =
                url.startsWith('http:')  ?  requestHTTP(url, { method, headers, ...options }) :
                url.startsWith('https:') ? requestHTTPS(url, { method, headers, ...options, ...params.tls }) :
                undefined;

            if (!request) {
                throw new TypeError(`URI ${this}: Unexpected protocol: ${this.protocol}`);
            }

            params.console?.debug?.(`${reqDesc} ▲ ${JSON.stringify(headers)}`);

            const result = new Promise<T & Metadata>((resolve, reject) => {
                request.on('response', async (response) => {
                    try {
                        params.console?.debug?.(`${reqDesc} ▼ ${JSON.stringify(response.headers)}`);

                        if (response.statusCode ?? 1000 < 400) {
                            params.console?.info?.(`${reqDesc} ► ${response.statusCode} ${response.statusMessage} <${Date.now() - started} ms>`);
                        } else {
                            params.console?.warn?.(`${reqDesc} ► ${response.statusCode} ${response.statusMessage} <${Date.now() - started} ms>`);
                        }

                        const result: T & Metadata = method === 'HEAD' || response.statusCode === 204 /* No Content */ ? Object(VOID) :
                            await Parser.parse(Encoder.decode(response, response.headers['content-encoding'] ?? []),
                                               ContentType.create(recvCT, response.headers['content-type']));

                        result[HEADERS]     = convertHeaders(response);
                        result[STATUS]      = response.statusCode;
                        result[STATUS_TEXT] = response.statusMessage;

                        resolve(result);
                    }
                    catch (err) {
                        reject(this._makeIOError(err));
                    }
                })
                .on('error', (err) => reject(this._makeIOError(err)));
            }).catch((err) => {
                params.console?.error?.(`${reqDesc} ► ${err} <${Date.now() - started} ms>`);
                throw err;
            })

            if (body) {
                await copyStream(Readable.from(body), request);
            }
            else {
                request.end();
            }

            return result;
        };

        let url = this.toString();
        let res = await request(method, url);

        // Redirect handling; See <https://fetch.spec.whatwg.org/#http-redirect-fetch>
        for (let redirectsLeft = params.maxRedirects ?? 20; redirectsLeft > 0; --redirectsLeft) {
            const s = res[STATUS] ?? 0;

            if ((s === 301 || s === 302) && method === 'POST' || s === 303 && method !== 'GET' && method !== 'HEAD') {
                method = 'GET';
                body   = undefined;

                delete headers['content-type'];
                delete headers['content-length'];
                delete headers['content-encoding'];
                delete headers['content-language'];
            }

            if ([301, 302, 303, 307, 308].includes(s)) {
                url = new URL(res[HEADERS]?.['location'] ?? '', url).toString();
                res = await request(method, url);
            }
            else {
                break;
            }
        }

        return res;
    }
}

function extractMetadata(m: Metadata) {
    return { [STATUS]: m[STATUS], [STATUS_TEXT]: m[STATUS_TEXT], [HEADERS]: m[HEADERS] };
}

function convertHeaders(response: IncomingMessage): StringParams {
    const result: StringParams = {};

    for (const [name, value] of Object.entries({ ...response.headers, ...response.trailers })) {
        result[name] = Array.isArray(value) ? value.join(', ') : value;
    }

    return result;
}

URI
    .register('http:',  HTTPURI)
    .register('https:', HTTPURI)
;
