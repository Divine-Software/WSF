/* eslint-disable jsdoc/require-jsdoc */

import { Record, throwError } from '@divine/commons';
import { WWWAuthenticate } from '@divine/headers';
import { URL } from 'url';
import { AuthScheme, Credentials, CredentialsProvider } from './auth-schemes';
import { StringParams } from './uri-types';

/**
 * A set of rules that must all match a given URL or authentication parameters for it to be valid or active.
 */
export interface Selector {
    /** A filter for the required authentication realm. The matching score is 1. */
    authRealm?:  string | RegExp;

    /** A filter for the required authentication scheme. The matching score is 2. */
    authScheme?: string | RegExp;

    /** A filter for the required URL protocol. The matching score is 4. */
    protocol?:   string | RegExp;

    /** A filter for the required URL path. The matching score is 8. */
    pathname?:   string | RegExp;

    /** A filter for the required URL port. The matching score is 16. */
    port?:       string | RegExp | number;

    /** A filter for the required URL host. The matching score is 32. */
    hostname?:   string | RegExp;

    /** A filter for the required URL (all-in-one filter). The matching score is 64. */
    uri?:        string | RegExp;
}

export interface SelectorBase {
    /** The selector that must match for this configuration to apply. */
    selector?: Selector;
}

export type AnySelector = Partial<AuthSelector> & Partial<HeadersSelector> & Partial<ParamsSelector> & Partial<SessionSelector>;

/** Provides authentication for {@link URI} and its subclasses.. */
export interface AuthSelector extends SelectorBase {
    /** The credentials or credential provider to use for authentication. */
    credentials: CredentialsProvider<Credentials> | Credentials | AuthScheme<Credentials>;

    /** Set to `true` to send credentials even before requested by the server. */
    preemptive?: boolean;
}

export function isAuthSelector(selector: AnySelector): selector is AuthSelector {
    return ['function', 'object'].includes(typeof selector.credentials) &&
        (selector.preemptive === undefined || typeof selector.preemptive === 'boolean');
}

/** Provides request headers for {@link URI} and its subclasses, most notably {@link HTTPURI}. */
export interface HeadersSelector extends SelectorBase {
    /** The headers to send. */
    headers: StringParams;
}

export function isHeadersSelector(selector: AnySelector): selector is HeadersSelector {
    return typeof selector.headers === 'object';
}

/** General URI configuration parameters.  */
export interface URIParams {
    /** A Console to use for debug logging. */
    console?: Partial<Console>;
}

/** Provides configuration parameters for {@link URI} and its subclasses. */
export interface ParamsSelector extends SelectorBase {
    /** The parameters to apply. */
    params: URIParams;
}

export function isParamsSelector(selector: AnySelector): selector is ParamsSelector {
    return typeof selector.params === 'object';
}

export interface SessionSelector extends SelectorBase {
    states: { [key: string]: unknown };
}

export function isSessionSelector(selector: AnySelector): selector is SessionSelector {
    return typeof selector.states === 'object';
}

export interface AuthSessionSelector extends SessionSelector {
    states: {
        authScheme?: AuthScheme<Credentials>;
    }
}

export function isSameSelector(sel1: AnySelector, sel2: AnySelector): boolean {
    const sig = (sel: AnySelector) => JSON.stringify(Object.entries(sel.selector ?? {})
        .map(([k, v]) => [k, String(v)])
        .sort(([k1], [k2]) => k1.localeCompare(k2))
    );

    return sig(sel1) === sig(sel2);
}

export function updateSelector(target: AnySelector, source: AnySelector, kind: 'auth' | 'headers' | 'params' | 'session', merge: boolean): AnySelector {
    const result = { ...target }; // Shallow copy of all non-affected properties

    if (kind === 'auth') {
        if (merge) {
            throwError('Merging auth selectors is not supported.');
        } else {
            result.credentials = source.credentials;
            result.preemptive  = source.preemptive;
        }
    } else if (kind === 'headers') {
        result.headers = Record({ ...(merge ? target.headers : null), ...source.headers });
    } else if (kind === 'params') {
        result.params  = Record({ ...(merge ? target.params  : null), ...source.params  });
    } else if (kind === 'session') {
        result.states  = Record({ ...(merge ? target.states  : null), ...source.states  });
    } else {
        throw new TypeError(`Unknown selector kind '${kind}'.`);
    }

    return result;
}

export function getBestSelector<T extends SelectorBase>(sels: T[] | undefined, url: URL, challenge?: WWWAuthenticate): T | null {
    return filterSelectors(sels, url, challenge)[0] ?? null;
}

export function filterSelectors<T extends SelectorBase>(sels: T[] | undefined,  url: URL, challenge?: WWWAuthenticate): T[] {
    return [...enumerateSelectors(sels, url, challenge)]
        .sort((a, b) => b.score - a.score /* Best first */)
        .map((e) => e.sel);
}

export function *enumerateSelectors<T extends SelectorBase>(sels: T[] | undefined, url: URL, challenge?: WWWAuthenticate): Generator<{ sel: T, score: number }> {
    const urlWithoutHash = url.href.replace(/#.*/, '');

    for (const sel of sels ?? []) {
        let score = 0;

        score += selectorScore(sel, 'authRealm',  challenge?.realm)  * 1;
        score += selectorScore(sel, 'authScheme', challenge?.scheme) * 2;
        score += selectorScore(sel, 'protocol',   url.protocol)      * 4;
        score += selectorScore(sel, 'pathname',   url.pathname)      * 8;
        score += selectorScore(sel, 'port',       url.port)          * 16;
        score += selectorScore(sel, 'hostname',   url.hostname)      * 32;
        score += selectorScore(sel, 'uri',        urlWithoutHash)    * 64;

        if (score >= 0) {
            yield { sel, score };
        }
    }
}

function selectorScore(sel: SelectorBase, key: keyof Selector, value?: string): number {
    const expected = sel.selector?.[key];

    if (expected === undefined || value === undefined) {
        return 0;
    }
    else if (expected instanceof RegExp) {
        return expected.test(decodeURIComponent(value)) ? 1 : -Infinity;
    }
    else {
        return String(expected) === decodeURIComponent(value) ? 1 : -Infinity;
    }
}
