import { ContentType } from '@divine/headers';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import xdg from 'xdg-portable';
import pkg from '../../package.json';
import { DirectoryEntry, Metadata, URI } from '../uri';
import { FileURI, FileWatchEvent } from './file';

const cacheDir = resolve(xdg.cache(), pkg.name, 'CacheURI', 'v1');
const cacheAge = 3600_000 /* 1 hour */;

setTimeout(() => {
    void pruneCacheDir().then(() => {
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

/**
 * The `cache:` protocol handler can be used to store (large and small) temporary files on disk.
 *
 * A cached file will be automatically pruned after 1 hour, if {@link remove} has not been called manually.
 */
export class CacheURI extends URI {
    /**
     * Creates a new cached file resource.
     *
     * Then use {@link save} to store data and {@link load} to retrieve it back.
     *
     * @param   type  The cache file's media type.
     * @returns       A new CacheURI instance.
     */
    static create(type: ContentType | string): CacheURI {
        return new URI(`cache:${type},${v4uuid()}`) as CacheURI;
    }

    private _type: ContentType;
    private _path: string;
    private _file: FileURI;

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

    /** See {@link FileURI.info}. */
    override async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        return { ...await this._delegate('info') as T, type: new ContentType(this._type) };
    }

    /** See {@link FileURI.load}. */
    override async load<T extends object>(recvCT?: ContentType | string): Promise<T & Metadata> {
        return await this._delegate('load', recvCT ?? this._type);
    }

    /** See {@link FileURI.save}. */
    override async save<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        return await this._delegate('save', data, sendCT, recvCT);
    }

    /** See {@link FileURI.append}. */
    override async append<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        return await this._delegate('append', data, sendCT, recvCT);
    }

    /** See {@link FileURI.remove}. */
    override async remove<T extends object>(recvCT?: undefined): Promise<T & Metadata> {
        return await this._delegate('remove', recvCT);
    }

    /** See {@link FileURI.watch}. */
    override async* watch(): AsyncIterable<FileWatchEvent & Metadata> {
        await createCacheDir();

        yield* this._file.watch();
    }

    private async _delegate(method: keyof CacheURI, ...args: any[]): Promise<any> {
        await createCacheDir();

        return (this._file as any)[method](...args);
    }
}

URI.register('cache:', CacheURI);
