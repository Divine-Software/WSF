export interface ContentHeaderParams {
    [name: string]: { name: string, value: string } | undefined;
}

export abstract class ContentHeader {
    private _type: string;
    readonly params: ContentHeaderParams = {};

    constructor(unparsed: string | ContentHeader, public readonly headerName?: string) {
        if (unparsed instanceof ContentHeader) {
            this._type  = unparsed._type;
            this.params = JSON.parse(JSON.stringify(unparsed.params));
            return;
        }

        const [, type, params] = /\s*([^\s;]*)\s*(.*)/.exec(unparsed)!;

        this._type = type;

        for (let pr = /;\s*([^\s=]*)\s*=\s*(?:([^";]+)|"((?:[^"\\]|\\.)*)")[^;]*/g, param = pr.exec(params); param; param = pr.exec(params)) {
            let name  = param[1];
            let value = param[2] !== undefined ? param[2] : param[3].replace(/\\(.)/g, '$1');

            if (name.endsWith('*')) {
                const [, charset, /* language */, encoded] = /^([^']*)'([^']*)'(.*)/.exec(value) || ['', '', '', ''];

                try {
                    if (charset.toLowerCase() === 'utf-8') {
                        value = decodeURIComponent(encoded);
                    }
                    else {
                        value = unescape(encoded); // Assume Latin 1
                    }
                }
                catch (ex) {
                    value = unescape(encoded); // Just try Latin 1 then
                }

                name = name.substr(0, name.length - 1);
                delete this.params[name.toLowerCase()];
            }

            if (this.params[name.toLowerCase()] === undefined) {
                this.params[name.toLowerCase()] = { name, value };
            }
        }
    }

    get type(): string {
        return this._type.toLowerCase();
    }

    param(name: string): string | undefined;
    param(name: string, fallback: string): string;
    param(name: string, fallback?: string): string | undefined {
        return this.params[name.toLowerCase()]?.value ?? fallback;
    }

    setParam(name: string, value: string | number | undefined): this {
        if (value !== undefined) {
            this.params[name.toLowerCase()] = { name, value: String(value) };
        }
        else {
            delete this.params[name.toLowerCase()];
        }

        return this;
    }

    toString(): string {
        let params = '';

        for (const param of Object.values(this.params)) {
            const safe = param!.value.replace(/[^\u0020-\u007e]/g, '_');

            if (/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(safe)) { // "any VCHAR, except delimiters"
                params += `;${param!.name}=${safe}`;
            } else {
                params += `;${param!.name}="${safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            }

            if (safe !== param!.value) {
                params += `;${param!.name}*=utf-8''${percentEncode(param!.value!)}`;
            }
        }

        return this.type + params;
    }

    valueOf(): string {
        return this.toString();
    }
}

export class ContentDisposition extends ContentHeader {
    static get attachment() : ContentDisposition { return new ContentDisposition('attachment'); }
    static get inline()     : ContentDisposition { return new ContentDisposition('inline');     }
    static get formData()   : ContentDisposition { return new ContentDisposition('form-data');  }

    static create(cd: string | ContentDisposition | null | undefined, fallback?: string | ContentDisposition | null): ContentDisposition {
        if (typeof cd === 'string' || cd instanceof ContentDisposition) {
            cd = new ContentDisposition(cd);
        }

        return cd ?? ContentDisposition.create(fallback, ContentDisposition.inline);
    }

    constructor(unparsed: string | ContentDisposition, filename?: string) {
        super(unparsed, 'content-disposition');

        if (filename !== undefined) {
            this.setParam('filename', filename);
        }
    }

    get filename(): string | undefined {
        return this.param('filename');
    }
}

export class ContentType extends ContentHeader {
    static get bytes()      : ContentType { return new ContentType('application/octet-stream');            }
    static get csv()        : ContentType { return new ContentType('text/csv');                            }
    static get dir()        : ContentType { return new ContentType('application/vnd.esxx.directory+json'); }
    static get formData()   : ContentType { return new ContentType('multipart/form-data');                 }
    static get html()       : ContentType { return new ContentType('text/html');                           }
    static get json()       : ContentType { return new ContentType('application/json');                    }
    static get stream()     : ContentType { return new ContentType('application/vnd.esxx.octet-stream');   }
    static get text()       : ContentType { return new ContentType('text/plain');                          }
    static get urlencoded() : ContentType { return new ContentType('application/x-www-form-urlencoded');   }
    static get xml()        : ContentType { return new ContentType('application/xml');                     }

    static create(ct: string | ContentType | null | undefined, fallback?: string | ContentType | null): ContentType {
        if (typeof ct === 'string' || ct instanceof ContentType) {
            ct = new ContentType(ct);
        }

        return ct ?? ContentType.create(fallback, ContentType.bytes);
    }

    constructor(unparsed: string | ContentType, charset?: string) {
        super(unparsed, 'content-type');

        if (charset !== undefined) {
            this.setParam('charset', charset);
        }
    }

    get baseType(): string {
        return this.type.split('/')[0];
    }

    get subType(): string {
        return this.type.split('/')[1];
    }

    get charset(): string | undefined {
        return this.param('charset');
    }
}

/** Percent-encode everything except 0-9, A-Z, a-z, `-`, `_`, `.`, `!` and `~`. */
function percentEncode(str: string) {
    return encodeURIComponent(str)
        .replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
