import { es6Encoder, percentEncode } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { extension, lookup } from 'mime-types';
import path from 'path';

/**
 * A template literal tag function that applies [[percentEncode]] to all arguments
 *
 * @param strings  The template string array.
 * @param values   The values to be encoded.
 * @returns        A string with the arguments encoded.
 */
export function uri(strings: TemplateStringsArray, ...values: unknown[]): string {
    return es6Encoder(strings, values, percentEncode);
}

/**
 * Normalizes a file path and then applies [[percentEncode]] to each individual path components.
 *
 * @param filepath The file path to encode.
 * @param type     Indictes how the file path should be normalized.
 * @returns        The encoded file path.
 */
export function encodeFilePath(filepath: string, type?: 'posix' | 'windows'): string {
    type = type || process.platform === 'win32' ? 'windows' : 'posix';

    if (type === 'windows') {
        filepath = path.win32.normalize(filepath);

        let prefix = '';

        if (/^[A-Za-z]:/.test(filepath)) {
            prefix = '/' + filepath.substr(0, 2).toUpperCase();
            filepath = filepath.substr(2);
        }

        return prefix + filepath.split(/\\/).map((part) => percentEncode(part)).join('/');
    }
    else if (type === 'posix') {
        filepath = path.posix.normalize(filepath);

        return filepath.split('/').map((part) => percentEncode(part)).join('/');
    }
    else {
        throw new TypeError(`Invalid filepath type: ${type}`);
    }
}

/**
 * If the media type is unknown, guesses the content type based on a path/file name. If the media type is known, that is
 * what will be returned.
 *
 * @param pathname          The name of the object whose media type to guess.
 * @param knownContentType  If provided, the actual media type.
 * @returns                 The value of `knownContentType` or a media type derived from the file name extension, or
 *                          `undefined`.
 */
export function guessContentType(pathname: string, knownContentType?: ContentType | string): ContentType | undefined {
    const ct = knownContentType ?? lookup(pathname);

    return ct ? new ContentType(ct) : undefined;
}

/**
 * If the file extension is unknown, derives the file name extension based on a media type. If the file extension is
 * known, that is what will be returned.
 *
 * @param contentType       The media type of the object whose file extension to guess.
 * @param invent            Set to `true` to invent an unofficial file extension if none could be guessed based on the
 *                          media type.
 * @param knownExtension    If provided, the actual file extension.
 * @returns                 The value of `knownExtension` or a file extension derived from the media type.
 */
export function guessFileExtension(contentType: ContentType | string, invent: true, knownExtension?: string): string;
/**
 * If the file extension is unknown, derives the file name extension based on a media type. If the file extension is
 * known, that is what will be returned.
 *
 * @param contentType       The media type of the object whose file extension to guess.
 * @param invent            If `false`, this method returns `undefined` if the file extension is unknown.
 * @param knownExtension    If provided, the actual file extension.
 * @returns                 The value of `knownExtension` or a file extension derived from the media type, or
 *                          `undefined` if the file extension is unknown.
 */
export function guessFileExtension(contentType: ContentType | string, invent?: boolean, knownExtension?: string): string | undefined;
export function guessFileExtension(contentType: ContentType | string, invent?: boolean, knownExtension?: string): string | undefined {
    const ct = ContentType.create(contentType);

    return knownExtension ?? (extension(ct.type) || invent && ct.type.replace(/.*?([^/+.]+)$/, '$1') || undefined);
}
