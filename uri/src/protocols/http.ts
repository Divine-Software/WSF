import { ContentType, KVPairs } from '@divine/headers';
import { Agent, IncomingMessage, request as requestHTTP } from 'http';
import { request as requestHTTPS } from 'https';
import path from 'path';
import { Readable } from 'stream';
import { SecureContextOptions } from 'tls';
import { URL } from 'url';
import pkg from '../../package.json';
import { Encoder } from '../encoders';
import { Parser } from '../parsers';
import { copyStream } from '../private/utils';
import { DirectoryEntry, HEADERS, IOError, Metadata, ParamsSelector, STATUS, STATUS_TEXT, URI, VOID } from '../uri';

export interface HTTPParamsSelector extends ParamsSelector {
    params: {
        agent?:        Agent;
        maxRedirects?: number;
        timeout?:      number;

        tls?: SecureContextOptions | {
            rejectUnauthorized?: boolean;
            servername?:         string;
        }
    };
}

export class HTTPURI extends URI {
    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        const response = await this._query<T>('HEAD', {}, null, undefined, undefined);
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

    async load<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('GET', {}, null, undefined, recvCT));
    }

    async save<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('PUT', {}, data, sendCT, recvCT));
    }

    async append<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('POST', {}, data, sendCT, recvCT));
    }

    async modify<T extends object>(data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('PATCH', {}, data, sendCT, recvCT));
    }

    async remove<T extends object>(recvCT?: ContentType | string): Promise<T> {
        return this._requireValidStatus(await this._query('DELETE', {}, null, undefined, recvCT));
    }

    async query<T extends object>(method: string, headers?: KVPairs | null, data?: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T> {
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

    protected _requireValidStatus<T extends object & Metadata>(result: T): T {
        const status = result[STATUS];

        if (status && (status < 200 || status >= 300)) {
            throw new IOError(`URI ${this} request failed: ${result[STATUS_TEXT]} [${status}]`, undefined, result);
        }
        else {
            return result;
        }
    }

    private async _query<T>(method: string, headers: KVPairs, data: unknown, sendCT?: ContentType | string, recvCT?: ContentType | string): Promise<T & Metadata> {
        let body: Buffer | AsyncIterable<Buffer> | undefined;

        headers = {
            'accept-encoding': 'gzip, deflate, br',
            'user-agent':      `Divine-URI/${pkg.version}`,
            ...this._getBestSelector(this.selectors.header)?.headers,
            ...headers
        };

        if (data !== null && data !== undefined) {
            const [serialized, contentType] = Parser.serialize(data, sendCT);

            headers = { 'content-type': contentType.toString(), ...headers };
            body = serialized;
        }

        if (!headers.authorization) {
            headers.authorization = (await this._getAuthorization({ method, url: this, headers: Object.entries(headers)}, body))?.toString();
        }

        // Bug workaround?
        headers = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));

        const params  = this._getBestSelector<HTTPParamsSelector>(this.selectors.param)?.params ?? {};
        const options = { agent: params.agent, timeout: params.timeout };
        const request = async (method: string, url: string) => {
            const request =
                url.startsWith('http:')  ?  requestHTTP(url, { method, headers, ...options }) :
                url.startsWith('https:') ? requestHTTPS(url, { method, headers, ...options, ...params.tls }) :
                undefined;

            if (!request) {
                throw new TypeError(`URI ${this}: Unexpected protocol: ${this.protocol}`);
            }

            const result = new Promise<T & Metadata>((resolve, reject) => {
                request.on('response', async (response) => {
                    try {
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
            });

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
                url = new URL(res[HEADERS]?.location ?? '', url).toString();
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

function convertHeaders(response: IncomingMessage): KVPairs {
    const result: KVPairs = {};

    for (const [name, value] of Object.entries({ ...response.headers, ...response.trailers })) {
        result[name] = Array.isArray(value) ? value.join(', ') : value;
    }

    return result;
}

URI
    .register('http:',  HTTPURI)
    .register('https:', HTTPURI)
;
