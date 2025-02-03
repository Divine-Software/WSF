import { asError, AsyncIteratorAdapter, copyStream, isOneOf, throwError, toReadableStream } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { R_OK } from 'constants';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { lookup } from 'mime-types';
import { basename, join, normalize } from 'path';
import { encodeFilePath } from '../file-utils';
import { Parser } from '../parsers';
import { DirectoryEntry, IOError, Metadata, URI, VOID } from '../uri';

const _chokidar = import('chokidar').catch(() => null);

/** The event produced by {@link FileURI.watch}. */
export interface FileWatchEvent {
    /** The type of event. */
    type: 'create' | 'update' | 'delete';

    /** The file resource that changed */
    uri:  FileURI;
}

const fileWatchEventType = {
    'add':       'create',
    'addDir':    'create',
    'change':    'update',
    'unlink':    'delete',
    'unlinkDir': 'delete',
} as const;

/**
 * The `file:` protocol handler is used to access files and directories on the local computer.
 *
 * File URIs may not have a *hostname* component (except if it is `localhost`), and no *search* or *hash* component.
 * Futhermore, the path may **not** contain encoded slashes (that is, the sequence `%2F` is forbidden).
 */
export class FileURI extends URI {
    /**
     * Creates a new FileURI by encoding the file path using {@link encodeFilePath}.
     *
     * @param  path       The a Windows or POSIX style file path, depending on current operating system.
     * @param  base       An optional URI to use when resolving relative paths.
     * @throws TypeError  If the resulting URI is not actually a FileURI.
     * @returns           A new FileURI instance.
     */
    static create(path: string, base?: FileURI): FileURI {
        const result = new URI(`${encodeFilePath(path)}`, base) as FileURI;

        if (result instanceof FileURI) {
            return result;
        }
        else {
            throw new TypeError(`FileURI.create result was not actually a FileURI`)
        }

    }

    private _path: string;

    constructor(uri: URI) {
        super(uri);

        if (this.hostname !== '' && decodeURIComponent(this.hostname).toLowerCase() !== 'localhost' || this.port !== '') {
            throw new TypeError(`URI ${this}: Host parts not allowed`);
        }
        else if (this.search !== '') {
            throw new TypeError(`URI ${this}: Query parts not allowed`);
        }
        else if (this.hash !== '') {
            throw new TypeError(`URI ${this}: Fragment parts not allowed`);
        }
        else if (/%2F/i.test(this.pathname) /* No encoded slashes */) {
            throw new TypeError(`URI ${this}: Path must not contain encoded slashes`);
        }

        this._path = normalize(decodeURIComponent(this.pathname));
    }

    /**
     * Calls `fs.stat()` on the file resourcce and constructs a {@link DirectoryEntry}.
     *
     * Directories will have its type set to {@link ContentType.dir} and the media type of files will be guessed based
     * on the file name extension.
     *
     * @throws IOError  On I/O errors or if this file/directory does not exist.
     * @returns         Information about this file resource.
     */
    override async info<T extends DirectoryEntry>(): Promise<T & Metadata> {
        try {
            const stats = await fs.stat(this._path);
            const ctype = stats.isDirectory() ? ContentType.dir : ContentType.create(lookup(this._path) || undefined);
            const entry: DirectoryEntry = {
                uri:     this,
                name:    basename(this._path),
                type:    ctype,
                length:  stats.size,
                created: stats.birthtime,
                updated: stats.mtime,
            };

            return entry as T;
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    /**
     * Calls `fs.readdir()` to list all resources inside this directory.
     *
     * @throws IOError  On I/O errors or if this resource is not a directory or does not exist.
     * @returns         A list with information about the files and subdirectories.
     */
    override async list<T extends DirectoryEntry>(): Promise<T[] & Metadata> {
        try {
            const children = await fs.readdir(this._path);

            // NOTE: Make the path absolute first, since `this` might not end with a '/' even though it might be a directory.
            return await Promise.all(children.sort().map((child) => FileURI.create(join(this._path, child), this).info<T>()));
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    /**
     * Loads and parses this file resource.
     *
     * @template T            The actual type returned.
     * @param    recvCT       Override the default response parser.
     * @throws   IOError      On I/O errors or if this resource is not a file or does not exist.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to parse the resource.
     * @returns               The file resource parsed as `recvCT` *into an object*, including {@link Metadata}.
     */
    override async load<T extends object>(recvCT?: ContentType | string): Promise<T & Metadata> {
        try {
            await fs.access(this._path, R_OK); // Throws immediately, unlike createReadStream()
            const stream = createReadStream(this._path, { flags: 'r', encoding: undefined });

            return await Parser.parse<T>(stream, ContentType.create(recvCT, lookup(this._path) || undefined));
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    /**
     * Serializes and stores data to the file this URI references, overwriting the file if it exists.
     *
     * @template T            Object.
     * @template D            The type of data to store.
     * @param    data         The data to store.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Must not be used.
     * @throws   IOError      On I/O errors or if this resource is not a file.
     * @throws   ParserError  If the media type is unsupported or if the parser fails to serialize the data.
     * @returns               Object({@link VOID}).
     */
    override async save<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        if (recvCT !== undefined) {
            throw new TypeError(`URI ${this}: save: recvCT argument is not supported`);
        }

        try {
            await this._write(data, sendCT, false);
            return Object(VOID);
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    /**
     * Serializes and appends data to the file this URI references, creating the file if it does not exist.
     *
     * @template T            Object.
     * @template D            The type of data to append.
     * @param    data         The data to append.
     * @param    sendCT       Override the default data serializer.
     * @param    recvCT       Must not be used.
     * @throws   IOError      On I/O errors or if this resource is not a file.
     * @throws   ParserError  If the media type is unsupported or ig the parser fails to serialize the data.
     * @returns               Object({@link VOID}).
     */
    override async append<T extends object, D = unknown>(data: D, sendCT?: ContentType | string, recvCT?: undefined): Promise<T & Metadata> {
        if (recvCT !== undefined) {
            throw new TypeError(`URI ${this}: append: recvCT argument is not supported`);
        }

        try {
            await this._write(data, sendCT, true);
            return Object(VOID);
        }
        catch (err) {
            throw this._makeIOError(err);
        }
    }

    /**
     * Removes the file or (the empty) directory this URI references.
     *
     * @template T            Object.
     * @param    recvCT       Must not be used.
     * @throws   IOError      On I/O errors.
     * @returns               Object(`true`) if the file was removed, or Object(`true`) if the resource did not exist in
     *                        the first place.
     */
    override async remove<T extends object>(recvCT?: undefined): Promise<T & Metadata> {
        if (recvCT !== undefined) {
            throw new TypeError(`URI ${this}: remove: recvCT argument is not supported`);
        }

        try {
            if ((await fs.stat(this._path)).isDirectory()) {
                await fs.rmdir(this._path);
            }
            else {
                await fs.unlink(this._path);
            }

            return Object(true);
        }
        catch (err) {
            if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                return Object(false);
            }
            else {
                throw this._makeIOError(err);
            }
        }
    }

    /**
     * Watches the file or directory (recusively) this URI references for changes.
     *
     * Each modification to the file or the filesystem below the directory will emit a {@link FileWatchEvent}. Use `for
     * await (...)` to read the events, propagate errors and to ensure the stream is closed correctly when you are done.
     *
     * Example usage:
     *
     * ```ts
     * for await (const event of FileURI.create('./src').watch()) {
     *     console.log(event.type, await event.uri.info());
     * }
     * ```
     *
     * @throws  IOError  On I/O errors.
     * @returns          A stream of change events.
     */
    override async* watch(): AsyncIterable<FileWatchEvent & Metadata> {
        const chokidar = await _chokidar ?? throwError(new IOError(`watch() requires chokidar as a peer dependency`));
        const adapter  = new AsyncIteratorAdapter<FileWatchEvent>();
        const watcher  = chokidar.watch(this._path, {
            atomic:        false,
            ignoreInitial: true,
        }).on('all', (type, path) => {
            if (isOneOf(type, [ 'add', 'addDir', 'change', 'unlink', 'unlinkDir' ])) {
                adapter.next({ type: fileWatchEventType[type], uri: FileURI.create(path, this) });
            }
        }).on('error', (err) => {
            adapter.throw(asError(err))
        });

        try {
            yield* adapter;
        }
        catch (err) {
            throw this._makeIOError(err);
        }
        finally {
            await watcher.close();
        }
    }

    private async _write(data: unknown, sendCT: ContentType | string | undefined, append: boolean): Promise<void> {
        const [serialized] = Parser.serialize(data, this._guessContentType(sendCT));

        await copyStream(toReadableStream(serialized), createWriteStream(this._path, { flags: append ? 'a' : 'w', encoding: undefined }));
    }
}

URI.register('file:', FileURI);
