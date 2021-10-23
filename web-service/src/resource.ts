import { StringParams } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { WebError, WebStatus } from './error';
import { WebRequest } from './request';
import { WebResponse, WebResponses } from './response';

export type WebErrorHandler<Context> = (err: Error, context: Context) => Promise<WebResponse>;

export interface WebFilterCtor<Context> {
    path: RegExp;

    new(context: Context, args: WebArguments): WebFilter;
}

export interface WebFilter {
    filter(next: () => Promise<WebResponse>, args: WebArguments, resource: () => Promise<WebResource>): Promise<WebResponses>;
}

export interface WebResourceCtor<Context> {
    path: RegExp;

    new(context: Context, args: WebArguments): WebResource;
}

export interface WebResource {
    init    ?(args: WebArguments): Promise<void>;
    close   ?(): Promise<void>;

    HEAD    ?(args: WebArguments): Promise<WebResponses>;
    GET     ?(args: WebArguments): Promise<WebResponses>;
    PUT     ?(args: WebArguments): Promise<WebResponses>;
    POST    ?(args: WebArguments): Promise<WebResponses>;
    PATCH   ?(args: WebArguments): Promise<WebResponses>;
    DELETE  ?(args: WebArguments): Promise<WebResponses>;
    OPTIONS ?(args: WebArguments): Promise<WebResponses>;
    default ?(args: WebArguments): Promise<WebResponses>;
    catch   ?(err: Error): WebResponse | Promise<WebResponse>;
}

export class WebArguments {
    public readonly params: { [key: string]: string | object | undefined };

    constructor(params: StringParams, public readonly request: WebRequest) {
        const urlargs = Object.entries(params);
        const headers = Object.entries(request.incomingMessage.headers);
        const qparams = [...request.url.searchParams.entries()];

        this.params = Object.fromEntries([
            ...urlargs.map(([k, v]) => ['$' + k, v]),
            ...headers.map(([k, v]) => ['@' + k, Array.isArray(v) ? v.join(', ') : v]),
            ...qparams.map(([k, v]) => ['?' + k, v])
        ]);
    }

    get log(): Console {
        return this.request.log;
    }

    async body<T extends object>(contentType?: ContentType | string, maxContentLength?: number): Promise<T> {
        const body = await this.request.body<T>(contentType, maxContentLength);

        if (!Array.isArray(body)) {
            for (const [k, v] of Object.entries(body)) {
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    this.params['.' + k] = String(v);
                }
                else if (typeof v === 'object') {
                    this.params['.' + k] = v;
                }
            }
        }

        return body;
    }

    has(param: string): boolean {
        return this._param(param, false) !== undefined;
    }

    boolean(param: string): boolean;
    boolean<T extends boolean | undefined | null>(param: string, def: T): boolean | T;
    boolean(param: string, def?: boolean | undefined | null): boolean | undefined | null {
        const value = this._param(param, arguments.length === 1)?.toString();

        if (value === undefined) {
            return def;
        }
        else if (value === 'true' || value === 't') {
            return true;
        }
        else if (value === 'false' || value === 'f') {
            return false;
        }
        else {
            throw this._makeWebError(param, 'is not a valid boolean');
        }
    }

    date(param: string): Date;
    date<T extends Date | undefined | null>(param: string, def: T): Date | T;
    date(param: string, def?: Date | undefined | null): Date | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined) {
            return def;
        }
        else {
            if (typeof value === 'string' && /^[0-9]{4}/.test(value)) {
                const parsed = new Date(value);

                if (isNaN(parsed.getTime())) {
                    throw this._makeWebError(param, 'is not a valid date');
                }

                return parsed;
            }
            else if (value instanceof Date) {
                return value;
            }
            else {
                throw this._makeWebError(param, 'is not a valid date');
            }
        }
    }

    number(param: string): number;
    number<T extends number | undefined | null>(param: string, def: T): number | T;
    number(param: string, def?: number | undefined | null): number | undefined | null {
        const value = this._param(param, arguments.length === 1)?.toString();

        if (value === undefined) {
            return def;
        }
        else {
            const parsed = Number(value);

            if (isNaN(parsed)) {
                throw this._makeWebError(param, 'is not a valid number');
            }

            return parsed;
        }
    }

    object<T extends object>(param: string): T;
    object<T extends object | undefined | null>(param: string, def: T): object | T;
    object<T extends object>(param: string, def?: T | undefined | null): T | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined || value === null) {
            return def;
        }
        else {
            if (typeof value !== 'object') {
                throw this._makeWebError(param, 'is not a valid object');
            }

            return value as T;
        }
    }

    string(param: string): string;
    string<T extends string | undefined | null>(param: string, def: T): string | T;
    string(param: string, def?: string | undefined | null): string | undefined | null {
        const value = this._param(param, arguments.length === 1);

        if (value === undefined) {
            return def;
        }
        else {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ) {
                return value.toString();
            }
            else if (value instanceof Date) {
                return value.toISOString();
            }
            else {
                throw this._makeWebError(param, 'is not a valid string');
            }
        }
    }

    private _param(param: string, required: boolean): boolean | number | string | object | null | undefined {
        const value = this.params[param];

        if (value === undefined && required) {
            throw this._makeWebError(param, 'is missing');
        }
        else {
            return value;
        }
    }

    private _makeWebError(param: string, is: string): WebError {
        const subject =
            param[0] === '?' ? `Query parameter '${param.substr(1)}'`  :
            param[0] === '@' ? `Request header '${param.substr(1)}'`   :
            param[0] === '$' ? `URL parameter '${param.substr(1)}'`    :
            param[0] === '.' ? `Entity parameter '${param.substr(1)}'` :
            `(Invalid) parameter '${param}'`;

        return new WebError(param[0] === '.' ? WebStatus.UNPROCESSABLE_ENTITY : WebStatus.BAD_REQUEST, `${subject} ${is}`);
    }
}
