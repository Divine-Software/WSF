import { es6Encoder, percentEncode } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { extension, lookup } from 'mime-types';
import path from 'path';

export function uri(strings: TemplateStringsArray, ...values: unknown[]): string {
    return es6Encoder(strings, values, percentEncode);
}

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

export function guessContentType(pathname: string, knownContentType: ContentType | string): ContentType;
export function guessContentType(pathname: string, knownContentType?: ContentType | string): ContentType | undefined;
export function guessContentType(pathname: string, knownContentType?: ContentType | string): ContentType | undefined {
    const ct = knownContentType ?? lookup(pathname);

    return ct ? new ContentType(ct) : undefined;
}

export function guessFileExtension(contentType: ContentType | string, invent: true, knownExtension?: string): string;
export function guessFileExtension(contentType: ContentType | string, invent: false, knownExtension: string): string;
export function guessFileExtension(contentType: ContentType | string, invent?: boolean, knownExtension?: string): string | undefined {
    const ct = ContentType.create(contentType);

    return knownExtension ?? (extension(ct.type) || invent && ct.type.replace(/.*?([^/+.]+)$/, '$1') || undefined);
}
