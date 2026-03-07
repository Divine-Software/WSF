import { ContentHeader, ContentTypeHeader, } from './content-headers';

export class Accept extends ContentTypeHeader {
    static create(unparsed: string | Accept[]): Accept[];
    static create(unparsed: string | Accept[] | undefined): Accept[] | undefined;
    static create(unparsed: string | Accept[] | undefined): Accept[] | undefined {
        return (typeof unparsed === 'string'
            ? unparsed.split(/\s*,\s*/g).map((header) => new Accept(header, 'accept'))
            : unparsed?.map((header) => new Accept(header))
        )?.sort((a, b) => b.q - a.q);
    }

    get q(): number {
        return parseFloat(this.param('q', '1')) || 0;
    }
}

export class AcceptCharset extends ContentHeader {
    static create(unparsed: string | AcceptCharset[]): AcceptCharset[];
    static create(unparsed: string | AcceptCharset[] | undefined): AcceptCharset[] | undefined;
    static create(unparsed: string | AcceptCharset[] | undefined): AcceptCharset[] | undefined {
        return (typeof unparsed === 'string'
            ? unparsed.split(/\s*,\s*/g).map((header) => new AcceptLanguage(header, 'accept-charset'))
            : unparsed?.map((header) => new AcceptLanguage(header))
        )?.sort((a, b) => b.q - a.q);
    }

    get q(): number {
        return parseFloat(this.param('q', '1')) || 0;
    }
}
export class AcceptEncoding extends ContentHeader {
    static create(unparsed: string | AcceptEncoding[]): AcceptEncoding[];
    static create(unparsed: string | AcceptEncoding[] | undefined): AcceptEncoding[] | undefined;
    static create(unparsed: string | AcceptEncoding[] | undefined): AcceptEncoding[] | undefined {
        return (typeof unparsed === 'string'
            ? unparsed.split(/\s*,\s*/g).map((header) => new AcceptLanguage(header, 'accept-encoding'))
            : unparsed?.map((header) => new AcceptLanguage(header))
        )?.sort((a, b) => b.q - a.q);
    }

    get q(): number {
        return parseFloat(this.param('q', '1')) || 0;
    }
}

export class AcceptLanguage extends ContentHeader {
    static create(unparsed: string | AcceptLanguage[]): AcceptLanguage[];
    static create(unparsed: string | AcceptLanguage[] | undefined): AcceptLanguage[] | undefined;
    static create(unparsed: string | AcceptLanguage[] | undefined): AcceptLanguage[] | undefined {
        return (typeof unparsed === 'string'
            ? unparsed.split(/\s*,\s*/g).map((header) => new AcceptLanguage(header, 'accept-language'))
            : unparsed?.map((header) => new AcceptLanguage(header))
        )?.sort((a, b) => b.q - a.q);
    }

    get q(): number {
        return parseFloat(this.param('q', '1')) || 0;
    }
}

export class AcceptPatch extends ContentTypeHeader {
    static create(unparsed: string | AcceptPatch[]): AcceptPatch[];
    static create(unparsed: string | AcceptPatch[] | undefined): AcceptPatch[] | undefined;
    static create(unparsed: string | AcceptPatch[] | undefined): AcceptPatch[] | undefined {
        return (typeof unparsed === 'string'
            ? unparsed.split(/\s*,\s*/g).map((header) => new AcceptPatch(header, 'accept-patch'))
            : unparsed?.map((header) => new AcceptPatch(header))
        )?.sort((a, b) => b.q - a.q);
    }

    get q(): number {
        return parseFloat(this.param('q', '1')) || 0;
    }
}
