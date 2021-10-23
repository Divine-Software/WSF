import { SizeLimitedReadableStream } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { AuthSchemeRequest, Finalizable, FINALIZE, Parser, ParserError } from '@divine/uri';
import cuid from 'cuid';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { TLSSocket } from 'tls';
import { UAParser } from 'ua-parser-js';
import { URL } from 'url';
import { WebError, WebStatus } from './error';
import { decorateConsole } from './private/utils';
import { WebServiceConfig } from './service';

export interface UserAgent {
    ua?:     string;
    browser: { name?: string, version?: string, major?: string };
    engine:  { name?: string, version?: string };
    os:      { name?: string, version?: string };
    device:  { vendor?: string, model?: string, type?: 'console' | 'mobile' | 'tablet' | 'smarttv' | 'wearable' | 'embedded' };
    cpu:     { architecture?: '68k' | 'amd64' | 'arm' | 'arm64' | 'avr' | 'ia32' | 'ia64' | 'irix' | 'irix64' | 'mips' | 'mips64' | 'pa-risc' | 'ppc' | 'sparc' | 'spark64' };
}

const REQUEST_ID = /^[0-9A-Za-z+=/-]{1,200}$/;

export class WebRequest implements AuthSchemeRequest {
    public readonly method: string;
    public readonly url: URL;
    public readonly remoteAddress: string;
    public readonly userAgent: UserAgent;
    public readonly id: string;
    public readonly log: Console;

    private _body?: Promise<any>;
    private _finalizers: Array<() => Promise<unknown>> = [];
    private _maxContentLength: number;

    constructor(public incomingMessage: IncomingMessage, config: Required<WebServiceConfig>) {
        const incomingScheme = incomingMessage.socket instanceof TLSSocket ? 'https' : 'http';
        const incomingServer = incomingMessage.headers.host ?? `${incomingMessage.socket.localAddress}:${incomingMessage.socket.localPort}`;
        const incomingRemote = incomingMessage.socket.remoteAddress;
        const incomingMethod = incomingMessage.method;
        const incomingReqID  = config.trustRequestID && incomingMessage.headers[config.trustRequestID.toLowerCase()]?.toString();

        const scheme       = String((config.trustForwardedProto ? this.header('x-forwarded-proto',      '', false) : '') || incomingScheme);
        const server       = String((config.trustForwardedHost  ? this.header('x-forwarded-host',       '', false) : '') || incomingServer);
        this.remoteAddress = String((config.trustForwardedFor   ? this.header('x-forwarded-for',        '', false) : '') || incomingRemote);
        this.method        = String((config.trustMethodOverride ? this.header('x-http-method-override', '', false) : '') || incomingMethod);
        this.url           = new URL(`${scheme}://${server}${incomingMessage.url}`);
        this.userAgent     = new UAParser(incomingMessage.headers['user-agent']).getResult() as any;
        this.id            = incomingReqID && REQUEST_ID.test(incomingReqID) ? incomingReqID : cuid();
        this.log           = config.logRequestID ? decorateConsole(config.console, `#${this.id}`) : config.console;

        this._maxContentLength = config.maxContentLength;

        if (!this.userAgent.browser.name && this.userAgent.ua) {
            const match = /^(?<name>[^/]+)(?:\/(?<version>(?<major>[^.]+)[^/ ]*))?/.exec(this.userAgent.ua);

            if (match) {
                this.userAgent.browser = { ...match.groups };
            }
        }
    }

    get remoteUserAgent(): string {
        return this.userAgent.browser.name && this.userAgent.browser.version ?
            `${this.userAgent.browser.name}/${this.userAgent.browser.version}@${this.remoteAddress}` :
            `Unknown@${this.remoteAddress}`;
    }

    get headers(): Array<[string, string]> {
        return Object.entries(this.incomingMessage.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value!]);
    }

    header(name: keyof IncomingHttpHeaders, def?: string | string[], concatenate = true): string {
        let value = this.incomingMessage.headers[String(name).toLowerCase()];

        if (value === undefined || value instanceof Array && value[0] === undefined) {
            if (def === undefined) {
                throw new WebError(WebStatus.BAD_REQUEST, `Request header '${name}' is missing`); // See also WebArguments
            }

            value = def;
        }

        if (Array.isArray(value)) {
            return concatenate ? value.join(', ') : value[0];
        }
        else {
            return value;
        }
    }

    async body<T extends object>(contentType?: ContentType | string, maxContentLength = this._maxContentLength): Promise<T> {
        try {
            if (!this._body) {
                const tooLarge = `Maximum payload size is ${maxContentLength} bytes`;

                if (Number(this.header('content-length', '-1')) > maxContentLength) {
                    throw new WebError(WebStatus.PAYLOAD_TOO_LARGE, tooLarge);
                }

                const limited = new SizeLimitedReadableStream(maxContentLength, () => new WebError(WebStatus.PAYLOAD_TOO_LARGE, tooLarge));
                const body = this._body = Parser.parse<T>(this.incomingMessage.pipe(limited), ContentType.create(contentType, this.header('content-type')));

                return this.addFinalizer(await body);
            }
            else {
                return await this._body;
            }
        }
        catch (err) {
            throw err instanceof WebError    ? err :
                  err instanceof ParserError ? new WebError(WebStatus.UNSUPPORTED_MEDIA_TYPE, err.message) :
                  err;
        }
    }

    addFinalizer<T extends object>(finalizable: T & Finalizable): T {
        const finalize = finalizable[FINALIZE];

        if (finalize) {
            this._finalizers.push(finalize);
        }

        return finalizable;
    }

    async close(): Promise<void> {
        // Run all finalizers, but do propagate first error
        await Promise.all(this._finalizers.map((finalize) => finalize()));
    }

    toString(): string {
        const ct = this.incomingMessage.headers['content-type']?.replace(/;.*/, '');

        return `[WebRequest: ${this.method} ${this.url.href} ${ct ?? '-'}]`;
    }
}
