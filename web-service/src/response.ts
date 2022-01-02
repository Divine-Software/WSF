import { isReadableStream } from '@divine/commons';
import { ContentDisposition, ContentType, WWWAuthenticate } from '@divine/headers';
import { Parser } from '@divine/uri';
import { Readable } from 'stream';
import { URL } from 'url';
import { WebError, WebStatus } from './error';
import { WebRequest } from './request';
import { WebServiceConfig } from './service';

export interface RawResponse {
    status:  number;
    headers: { [name: string]: string | string[] };
    body:    Buffer | NodeJS.ReadableStream | null;
}

export class WebResponse {
    public body: Buffer | NodeJS.ReadableStream | null;

    constructor(public status: WebStatus, body?: null | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object, public headers: WebResponseHeaders = {}) {
        const defaultCT = (ct: ContentType) => this.headers['content-type'] ??= ct;

        if (body === undefined || body === null) {
            this.body = null;
        }
        else if (body instanceof Buffer || isReadableStream(body)) {
            defaultCT(ContentType.bytes);
            this.body = body;
        }
        else if (typeof body === 'string' || typeof body === 'number' || typeof body === 'bigint' || typeof body === 'boolean' || body instanceof Date) {
            defaultCT(ContentType.text);
            this.body = Buffer.from(body instanceof Date ? body.toISOString() : body.toString());
        }
        else {
            try {
                const [serializied, ct] = Parser.serialize(body, this.headers['content-type']);

                this.headers['content-type'] = ct; // Force parser-provided content-type (see MultiPartParser.serialize())
                this.body = serializied instanceof Buffer ? serializied : Readable.from(serializied);
            }
            catch (err) {
                throw new WebError(WebStatus.INTERNAL_SERVER_ERROR, String(err));
            }
        }

        if (this.body instanceof Buffer) {
            this.headers['content-length'] = this.body.length;
        }
    }

    setHeader(name: keyof WebResponseHeaders | string, value: string | number | boolean | string[] | undefined): this {
        (this.headers as any)[name.toLowerCase()] = value;

        return this;
    }

    async close(): Promise<void> {
        if (this.body instanceof Readable) {
            this.body.destroy();
        }
    }

    async serialize(webreq: WebRequest, config: Required<WebServiceConfig>): Promise<RawResponse> {
        const response: RawResponse = {
            status:    this.status,
            headers:   {},
            body:      this.body,
        };

        for (const [key, value] of Object.entries(this.headers)) {
            if (Array.isArray(value)) {
                response.headers[key] = value.map((v) => String(v));
            }
            else if (value !== undefined) {
                response.headers[key] = String(value);
            }
        }

        if (response.status === WebStatus.OK && /^(HEAD|GET)$/.test(webreq.method) &&
            response.headers['etag'] && response.headers['etag'] === webreq.header('if-none-match', '')) {
            response.status = WebStatus.NOT_MODIFIED;
            response.body   = null;
        }

        if (webreq.method === 'HEAD') {
            response.body = null;
        }

        if (config.returnRequestID && response.headers[config.returnRequestID] === undefined) {
            response.headers[config.returnRequestID] = webreq.id;
        }

        return response;
    }

    toString(): string {
        const ct = this.headers['content-type']?.toString().replace(/;.*/, '');

        return `[WebResponse: ${this.status} ${WebStatus[this.status] || this.status} ${ct ?? '-'}]`;
    }
}

export interface WebResponseHeaders {
    'accept-patch'?:                     string | ContentType;
    'accept-ranges'?:                    string;
    'access-control-allow-credentials'?: string | boolean;
    'access-control-allow-headers'?:     string | string[];
    'access-control-allow-methods'?:     string | string[];
    'access-control-allow-origin'?:      string | URL;
    'access-control-expose-headers'?:    string | string[];
    'access-control-max-age'?:           string | number;
    'age'?:                              string | number;
    'allow'?:                            string | string[];
    'alt-svc'?:                          string;
    'cache-control'?:                    string;
    'connection'?:                       string;
    'content-disposition'?:              string | ContentDisposition;
    'content-encoding'?:                 string | string[];
    'content-language'?:                 string;
    'content-length'?:                   string | number;
    'content-location'?:                 string | URL;
    'content-md5'?:                      string;
    'content-range'?:                    string;
    'content-security-policy'?:          string;
    'content-type'?:                     string | ContentType;
    'date'?:                             string | Date;
    'delta-base'?:                       string;
    'etag'?:                             string;
    'expires'?:                          string | Date;
    'im'?:                               string;
    'last-modified'?:                    string | Date;
    'link'?:                             string;
    'location'?:                         string | URL;
    'p3p'?:                              string;
    'pragma'?:                           string;
    'proxy-authenticate'?:               string | WWWAuthenticate | WWWAuthenticate[];
    'public-key-pins'?:                  string;
    'refresh'?:                          string | number | Date;
    'retry-after'?:                      string;
    'server'?:                           string;
    'set-cookie'?:                       string;
    'strict-transport-security'?:        string;
    'timing-allow-origin'?:              string | string[];
    'tk'?:                               string;
    'trailer'?:                          string | string[];
    'transfer-encoding'?:                string | string[];
    'upgrade'?:                          string | string[];
    'vary'?:                             string | string[];
    'via'?:                              string | string[];
    'warning'?:                          string;
    'www-authenticate'?:                 string | WWWAuthenticate | WWWAuthenticate[];
    'x-content-duration'?:               string | number;
    'x-content-security-policy'?:        string;
    'x-content-type-options'?:           string;
    'x-correlation-id'?:                 string;
    'x-frame-options'?:                  string;
    'x-powered-by'?:                     string;
    'x-request-id'?:                     string;
    'x-ua-compatible'?:                  string;
    'x-webkit-csp'?:                     string;
    'x-xss-protection'?:                 string;
}

export type WebResponses = null | WebResponse | NodeJS.ReadableStream | Buffer | string | number | bigint | boolean | Date | object;
