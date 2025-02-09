import { ContentType } from '@divine/headers';
import { DirectoryEntry, Metadata, URI, VOID } from '../uri';
import { Parser } from '../parsers';

export class DataURI extends URI {
    constructor(uri: URI) {
        super(uri);

        if (this.username !== '' || this.password !== '' || this.hostname !== '' || this.port !== '' || this.search !== '' || this.hash !== '') {
            throw new TypeError(`URI ${this}: Username/password/host/port/query/fragment parts not allowed`);
        }

        this._decode();
    }

    override async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        const [ type, _, data ] = this._decode();

        return {
            uri:    this,
            name:   '',
            type:   type,
            length: data.length
        } satisfies DirectoryEntry as unknown as T;
    }

    override async load<T extends object>(recvCT?: ContentType | string): Promise<T & Metadata> {
        const [ type, _, data ] = this._decode();

        return await Parser.parse<T>(data, ContentType.create(recvCT, type));
    }

    override async save<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        if (recvCT !== undefined) {
            throw new TypeError(`URI ${this}: save: recvCT argument is not supported`);
        }

        await this._write(data, sendCT, false);
        return Object(VOID);
    }

    override async append<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        if (recvCT !== undefined) {
            throw new TypeError(`URI ${this}: append: recvCT argument is not supported`);
        }

        await this._write(data, sendCT, true);
        return Object(VOID);
    }

    private _decode(): [ContentType, boolean, Buffer] {
        const parts = /^data:([^,]*),(.*)$/.exec(this.href);

        if (!parts) {
            throw new TypeError(`URI ${this}: Malformed data URI`);
        }

        const type = ContentType.create(decodeURI(parts[1]).replace(/;base64$/, '') || null, 'text/plain;charset=US-ASCII');
        const base = parts[1].endsWith(';base64');
        const data = base ? Buffer.from(parts[2], 'base64') : Buffer.from(unescape(parts[2]), 'latin1');

        return [ type, base, data ];
    }

    private _encode(type: ContentType, base64: boolean, data: Buffer): void {
        const encoded = base64 ? data.toString('base64') : escape(data.toString('latin1'));

        super._href = `data:${encodeURI(type.toString())}${base64 ? ';base64' : ''},${encoded}`;
    }

    private async _write(chunk: unknown, sendCT: ContentType | string | undefined, append: boolean): Promise<void> {
        const [ type, base64, data ] = this._decode();
        const [ serialized, ct ] = await Parser.serializeToBuffer(chunk, sendCT ?? type);

        this._encode(ct, base64, append ? Buffer.concat([ data, serialized ]) : serialized);
    }
}

URI.register('data:', DataURI);
