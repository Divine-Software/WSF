import { Params, StringParams } from '@divine/commons';
import { WWWAuthenticate } from '@divine/headers';
import { URL } from 'url';
import { AuthScheme, Credentials, CredentialsProvider } from './auth-schemes';

export interface Selector {
    authRealm?:  string | RegExp;
    authScheme?: string | RegExp;
    protocol?:   string | RegExp;
    pathname?:   string | RegExp;
    port?:       string | RegExp | number;
    hostname?:   string | RegExp;
    uri?:        string | RegExp;
}

export interface SelectorBase {
    selector?: Selector;
}

export interface AuthSelector extends SelectorBase {
    credentials: CredentialsProvider<Credentials> | Credentials | AuthScheme<Credentials>;
    preemptive?: boolean;
}

export function isAuthSelector(selector: any): selector is AuthSelector {
    return ['function', 'object'].includes(typeof selector.credentials) &&
        (selector.preemptive === undefined || typeof selector.preemptive === 'boolean');
}

export interface HeadersSelector extends SelectorBase {
    headers: StringParams;
}

export function isHeadersSelector(selector: any): selector is HeadersSelector {
    return typeof selector.headers === 'object';
}

export interface ParamsSelector extends SelectorBase {
    params: Params;
}

export function isParamsSelector(selector: any): selector is ParamsSelector {
    return typeof selector.params === 'object';
}

export interface SessionSelector extends SelectorBase {
    states: { [key: string]: unknown };
}

export function isSessionSelector(selector: any): selector is SessionSelector {
    return typeof selector.states === 'object';
}

export interface AuthSessionSelector extends SessionSelector {
    states: {
        authScheme?: AuthScheme<Credentials>;
    }
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
