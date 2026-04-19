/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable no-control-regex */

import { isOneOf } from '@divine/commons';
import { Precondition } from '@divine/uri';
import { IncomingHttpHeaders } from 'http';
import { WebResponseHeaders } from '../response';
import { createHash } from 'crypto';
import { version } from '../../package.json';

export function concatHeader(listHeader: string | string[] | undefined, ...items: string[]): string[] {
    const set = new Set(typeof listHeader === 'string' ? listHeader.split(/\s*,\s*/) : listHeader ?? []);
    items.forEach(item => set.add(item));
    return [...set];
}

// NOTE: We have no actual support for weak ETags, but if we find one in a user-generated `ETag` header, we keep it. If
// an `If-None-Match` header contains a weak ETag, we strip the weak prefix and compare it to the strong Precondition
// version as usual, matching the requirements of RFC 9110 8.8.3.2.

export function updateETag(etag: string, headers: WebResponseHeaders): string {
    const headersHash = createHash('sha256').update(
        version + Object.entries(headers)
            .filter(([key]) => headerAffectsETag(key))
            .map(([key, value]) => `${key}:${value}`)
            .sort()
            .join('\n')
        ).digest('base64url').substring(0, 8);

    // Also disallow commas and tilde, to make parsing easier
    if (etag.startsWith('W/')) {
        return `W/"${etag.substring(2).replace(/[\x00-\x20",~\x7f]/g, '')}~${headersHash}"`;
    } else {
        return `"${etag.replace(/[\x00-\x20",~\x7f]/g, '')}~${headersHash}"`;
    }
}

function headerAffectsETag(header: string): boolean {
    return header.startsWith('content-') && !isOneOf(header, ['content-location', 'content-range']);
}

export function parseETag(acceptWeak: boolean, versionOnly: boolean, etag: string): string{
    if (acceptWeak && etag.startsWith('W/')) {
        etag = etag.substring(2);
    }

    etag = etag.replace(/^"|"$/g, '');

    return versionOnly ? etag.split('~')[0] : etag;
}

function versionsFromIfHeader(acceptWeak: boolean, versionOnly: boolean, header: string): string[] {
    return header.split(/\s*,\s*/).map(etag => parseETag(acceptWeak, versionOnly, etag));
}

export function createCondition(method: string, headers: IncomingHttpHeaders): Precondition | undefined {
    const versionOnly = !isOneOf(method, ['GET', 'HEAD']);
    const { 'if-match': ifMatch, 'if-unmodified-since': ifUnmodified, 'if-none-match': ifNoneMatch, 'if-modified-since': ifModified } = headers;

    if ((ifMatch || ifUnmodified) && (ifNoneMatch || ifModified)) {
        return new Precondition('never'); // Conflicting preconditions not supported; make sure the condition fails
    } else if (ifMatch === '*') {
        return new Precondition('present')
    } else if (ifMatch) {
        return new Precondition('match', ...versionsFromIfHeader(false, versionOnly, ifMatch));
    } else if (ifUnmodified) {
        return new Precondition('unmodified-since', new Date(ifUnmodified))
    } else if (ifNoneMatch === '*') {
        return new Precondition('absent');
    } else if (ifNoneMatch) {
        return new Precondition('none-match', ...versionsFromIfHeader(true, versionOnly, ifNoneMatch));
    } else if (ifModified && isOneOf(method, ['GET', 'HEAD'])) {
        return new Precondition('modified-since', new Date(ifModified));
    } else {
        return undefined;
    }
}
