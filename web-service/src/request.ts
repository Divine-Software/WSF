import { ContentType } from '@divine/headers';
import { AuthSchemeRequest, Finalizable, FINALIZE, Parser } from '@divine/uri';
import cuid from 'cuid';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { TLSSocket } from 'tls';
import { UAParser } from 'ua-parser-js';
import { URL } from 'url';
import { WebException, WebStatus } from './error';
import { WebServiceConfig } from './service';
import { SizeLimitedReadableStream } from './utils';

export interface UserAgent {
    ua?:     string;
    browser: { name?: string, version?: string, major?: string };
    engine:  { name?: string, version?: string };
    os:      { name?: string, version?: string };
    device:  { vendor?: string, model?: string, type?: 'console' | 'mobile' | 'tablet' | 'smarttv' | 'wearable' | 'embedded' };
    cpu:     { architecture?: '68k' | 'amd64' | 'arm' | 'arm64' | 'avr' | 'ia32' | 'ia64' | 'irix' | 'irix64' | 'mips' | 'mips64' | 'pa-risc' | 'ppc' | 'sparc' | 'spark64' };
}

export class WebRequest implements AuthSchemeRequest {
    public readonly method: string;
    public readonly url: URL;
    public readonly remoteAddress: string;
    public readonly userAgent: UserAgent;
    public readonly id: string;

    private _finalizers: Array<() => Promise<void>> = [];
    private _maxContentLength: number;

    constructor(public incomingMessage: IncomingMessage, config: Required<WebServiceConfig>) {
        const incomingScheme = incomingMessage.socket instanceof TLSSocket ? 'https' : 'http';
        const incomingServer = incomingMessage.headers.host ?? `${incomingMessage.socket.localAddress}:${incomingMessage.socket.localPort}`;
        const incomingRemote = incomingMessage.socket.remoteAddress;
        const incomingMethod = incomingMessage.method;

        const scheme       = String((config.trustForwardedProto ? this.header('x-forwarded-proto',      '', false) : '') || incomingScheme);
        const server       = String((config.trustForwardedHost  ? this.header('x-forwarded-host',       '', false) : '') || incomingServer);
        this.remoteAddress = String((config.trustForwardedFor   ? this.header('x-forwarded-for',        '', false) : '') || incomingRemote);
        this.method        = String((config.trustMethodOverride ? this.header('x-http-method-override', '', false) : '') || incomingMethod);
        this.url           = new URL(`${scheme}://${server}${incomingMessage.url}`);
        this.userAgent     = new UAParser(incomingMessage.headers['user-agent']).getResult() as any;
        this.id            = cuid();

        this._maxContentLength = config.maxContentLength;

        if (!this.userAgent.browser.name && this.userAgent.ua) {
            const match = /^(?<name>[^/]+)(?:\/(?<version>(?<major>[^.]+)[^/ ]*))?/.exec(this.userAgent.ua);

            if (match) {
                this.userAgent.browser = { ...match.groups };
            }
        }
    }

    get remoteUserAgent(): string {
        return this.userAgent.browser.name && this.userAgent.browser.version ? `${this.userAgent.browser.name}/${this.userAgent.browser.version}@${this.remoteAddress}` : `Unknown@${this.remoteAddress}`;
    }

    get headers(): Iterable<[string, string]> {
        return Object.entries(this.incomingMessage.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value!]);
    }

    header(name: keyof IncomingHttpHeaders, def?: string | string[], concatenate = true): string {
        let value = this.incomingMessage.headers[String(name).toLowerCase()];

        if (value === undefined || value instanceof Array && value[0] === undefined) {
            if (def === undefined) {
                throw new WebException(WebStatus.BAD_REQUEST, `Missing request header '${name}'`);
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
        const tooLarge = `Maximum payload size is ${maxContentLength} bytes`;

        if (Number(this.header('content-length', '-1')) > maxContentLength) {
            throw new WebException(WebStatus.PAYLOAD_TOO_LARGE, tooLarge);
        }

        const limited = new SizeLimitedReadableStream(maxContentLength, () => new WebException(WebStatus.PAYLOAD_TOO_LARGE, tooLarge));

        return this.addFinalizer(await Parser.parse<T>(ContentType.create(contentType, this.header('content-type')), this.incomingMessage.pipe(limited)));
    }

    addFinalizer<T extends object>(finalizable: T & Finalizable): T {
        const finalize = finalizable[FINALIZE];

        if (finalize) {
            this._finalizers.push(finalize);
        }

        return finalizable;
    }

    close() {
        // Run all finalizers, but do propagate first error
        return Promise.all(this._finalizers.map((finalize) => finalize()));
    }

    toString(): string {
        const ct = this.incomingMessage.headers['content-type']?.replace(/;.*/, '');

        return `[WebRequest: ${this.method} ${this.url.href} ${ct ?? '-'}]`;
    }
}
