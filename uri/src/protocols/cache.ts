import { ContentType } from '@divine/headers';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import xdg from 'xdg-portable';
import pkg from '../../package.json';
import { DirectoryEntry, Metadata, URI } from '../uri';
import { FileURI } from './file';

const cacheDir = resolve(xdg.cache(), pkg.name, 'CacheURI', 'v1');
const cacheAge = 3600_000 /* 1 hour */;

setTimeout(() => {
    pruneCacheDir().then(() => {
        setInterval(() => pruneCacheDir(), 60_000).unref();
    });
}, 1000).unref();

async function createCacheDir(): Promise<void> {
    await fs.mkdir(cacheDir, { recursive: true });
}

async function pruneCacheDir(): Promise<void> {
    const oldest = Date.now() - cacheAge;

    for (const entry of await new URI(cacheDir).list().catch(() => [])) {
        if (entry.created && entry.created?.getTime() < oldest) {
            await entry.uri.remove().catch(() => { /* Whatever */ });
        }
    }
}

function v4uuid() {
    const buf = randomBytes(16);
    buf[6] = (buf[6] & 0x0f) | 0x40; buf[8] = (buf[8] & 0x3f) | 0x80;

    return [...buf].map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + (b + 0x100).toString(16).substr(1)).join('');
}

export class CacheURI extends URI {
    static create(type: ContentType | string): CacheURI {
        return new URI(`cache:${type},${v4uuid()}`) as CacheURI;
    }

    private _type: ContentType;
    private _path: string;
    private _file: URI;

    constructor(uri: URI) {
        super(uri);

        if (this.username !== '' || this.password !== '' || this.hostname !== '' || this.port !== '' || this.search !== '' || this.hash !== '') {
            throw new TypeError(`URI ${this}: Username/password/host/port/query/fragment parts not allowed`);
        }

        const parts = /^(.*),([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.exec(this.pathname);

        if (!parts) {
            throw new TypeError(`URI ${this}: Malformed cache URI`);
        }

        this._type = new ContentType(parts[1]);
        this._path = resolve(cacheDir, parts[2].toLowerCase());
        this._file = FileURI.create(this._path);
    }

    async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        return { ...await this._delegate('info') as T, type: new ContentType(this._type) };
    }

    load<T extends object>(recvCT?: ContentType | string): Promise<T & Metadata> {
        return this._delegate('load', recvCT ?? this._type);
    }

    async save(...args: any[]): Promise<any> {
        return this._delegate('save', ...args);
    }

    async modify(...args: any[]): Promise<any> {
        return this._delegate('modify', ...args);
    }

    async append(...args: any[]): Promise<any> {
        return this._delegate('append', ...args);
    }

    private async _delegate(method: keyof CacheURI, ...args: any[]): Promise<any> {
        await createCacheDir();

        return (this._file as any)[method](...args);
    }
}

URI.register('cache:', CacheURI);
