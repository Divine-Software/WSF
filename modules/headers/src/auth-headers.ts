export interface AuthHeaderParams {
    [name: string]: { name: string, value: string, quoted?: boolean } | undefined;
}

// Like RFC 7235, but very forgiving
// const AUTH_SCHEME  = /\s*(?<scheme>[^,\s]+)/;
// const AUTH_PARAM   = /\s*(?<param>[^=\s]+)\s*=\s*(?:"(?<qvalue>(?:\\(?:\\\\)*"|[^"])*)"|(?<value>[^=,\s]+))\s*,?/;
// const AUTH_TOKEN68 = /\s*(?<token68>[-._~+/a-zA-Z0-9]+=*)\s*,?/;
// const AUTH_HEADER  = RegExp(`${AUTH_SCHEME.source}(?:(?<params>(?:${AUTH_PARAM.source})+)|${AUTH_TOKEN68.source})?`);

// This library must work in old browsers, so no named capture groups :(
const AUTH_SCHEME  = /\s*([^,\s]+)/;
const AUTH_PARAM   = /\s*([^=\s]+)\s*=\s*(?:"((?:\\(?:\\\\)*"|[^"])*)"|([^=,\s]+))\s*,?/;
const AUTH_TOKEN68 = /\s*([-._~+/a-zA-Z0-9]+=*)\s*,?/;
const AUTH_HEADER  = RegExp(`${AUTH_SCHEME.source}(?:((?:${AUTH_PARAM.source})+)|${AUTH_TOKEN68.source})?`);

function authParamGroups(params: RegExpMatchArray) {
    return { param: params[1], qvalue: params[2], value: params[3] };
}

function headerGroups(headers: RegExpMatchArray) {
    return { scheme: headers[1], params: headers[2], param: headers[3], qvalue: headers[4], value: headers[5], token68: headers[6] };
}

export abstract class AuthHeader {
    static split(unparsed: string): string[] {
        const result: string[] = [];

        for (let pattern = new RegExp(AUTH_HEADER, 'g'), match = pattern.exec(unparsed); match; match = pattern.exec(unparsed)) {
            result.push(match[0].trim());
        }

        return result;
    }

    private _scheme!: string;
    readonly credentials?: string;
    readonly params: AuthHeaderParams = {};

    protected constructor(unparsed: string | AuthHeader, public readonly headerName: string) {
        if (unparsed instanceof AuthHeader) {
            this._scheme     = unparsed._scheme;
            this.credentials = unparsed.credentials;
            this.params      = JSON.parse(JSON.stringify(unparsed.params));
            return;
        }

        const parsed = AUTH_HEADER.exec(unparsed);
        const groups = parsed && headerGroups(parsed);
        const scheme = groups?.scheme;

        if (!scheme) {
            throw new TypeError(`Failed to parse AuthHeader '${unparsed}': Invalid format`);
        }

        this._scheme     = scheme;
        this.credentials = groups.token68;

        if (groups.params) {
            for (let pattern = new RegExp(AUTH_PARAM, 'g'), match = pattern.exec(groups.params); match; match = pattern.exec(groups.params)) {
                const groups = authParamGroups(match);
                const quoted = groups.qvalue !== undefined;

                this.params[groups.param.toLowerCase()] = { name: groups.param, value: quoted ? groups.qvalue.replace(/\\(.)/g, '$1') : groups.value, quoted };
            }
        }
    }

    get scheme(): string {
        return this._scheme.toLowerCase();
    }

    get realm(): string | undefined {
        return this.param('realm');
    }

    param(name: string): string | undefined;
    param(name: string, fallback: string): string;
    param(name: string, fallback?: string): string | undefined {
        return this.params[name.toLowerCase()]?.value ?? fallback;
    }

    setParam(name: string, value: string | number | undefined, quoted?: boolean): this {
        if (value !== undefined) {
            this.params[name.toLowerCase()] = { name, value: String(value), quoted };
        }
        else {
            delete this.params[name.toLowerCase()];
        }

        return this;
    }

    toString(): string {
        return `${this._scheme} ${this.credentials ?? this._formatParams()}`;
    }

    isProxyHeader(): boolean {
        return this.headerName.startsWith('proxy-');
    }

    protected _formatParams(): string {
        return Object.entries(this.params)
            .map(([param, info]) => info!.quoted ?? (!/^[-!#$%&'*+.0-9=A-Z^_`a-z|~]+$/.test(info!.value) || param === 'realm' /* [sic!] */)
                ? `${info!.name}="${info!.value.replace(/([\\"])/g, '\\$1')}"`
                : `${info!.name}=${info!.value}`)
            .join(', ');
    }

}

export class Authorization extends AuthHeader {
    static create(unparsed: string | Authorization): Authorization;
    static create(unparsed: string | Authorization | undefined): Authorization | undefined;
    static create(unparsed: string | Authorization | undefined): Authorization | undefined {
        return unparsed !== undefined ? new Authorization(unparsed) : undefined;
    }

    public constructor(unparsed: string | Authorization, proxy = false) {
        super(unparsed, proxy ? 'proxy-authorization' : 'authorization');
    }
}

export class AuthenticationInfo extends AuthHeader {
    static create(unparsed: string | AuthenticationInfo): AuthenticationInfo;
    static create(unparsed: string | AuthenticationInfo | undefined): AuthenticationInfo | undefined;
    static create(unparsed: string | AuthenticationInfo | undefined): AuthenticationInfo | undefined {
        return unparsed !== undefined ? new AuthenticationInfo(unparsed) : undefined;
    }

    public constructor(unparsed: string | AuthenticationInfo, proxy = false) {
        super(unparsed, proxy ? 'proxy-authentication-info' : 'authorization-info');
    }
}

export class ServerAuthorization extends AuthHeader {
    static create(unparsed: string | ServerAuthorization): ServerAuthorization;
    static create(unparsed: string | ServerAuthorization | undefined): ServerAuthorization | undefined;
    static create(unparsed: string | ServerAuthorization | undefined): ServerAuthorization | undefined {
        return unparsed !== undefined ? new ServerAuthorization(unparsed) : undefined;
    }

    public constructor(unparsed: string | ServerAuthorization, proxy = false) {
        super(unparsed, proxy ? 'proxy-server-authorization' : 'server-authorization');
    }
}

export class WWWAuthenticate extends AuthHeader {
    static create(unparsed: string | WWWAuthenticate[]): WWWAuthenticate[];
    static create(unparsed: string | WWWAuthenticate[] | undefined): WWWAuthenticate[] | undefined;
    static create(unparsed: string | WWWAuthenticate[] | undefined): WWWAuthenticate[] | undefined {
        if (typeof unparsed === 'string') {
            return AuthHeader.split(unparsed).map((header) => new WWWAuthenticate(header));
        }
        else if (unparsed !== undefined) {
            return unparsed.map((header) => new WWWAuthenticate(header));
        }
        else {
            return undefined;
        }
    }

    public constructor(unparsed: string | WWWAuthenticate, proxy = false) {
        super(unparsed, proxy ? 'proxy-authenticate' : 'www-authenticate');
    }
}
