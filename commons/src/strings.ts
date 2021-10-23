import { Params, ValueEncoder } from './types';

/** Percent-encode everything except 0-9, A-Z, a-z, `-`, `_`, `.`, `!` and `~`. */
export function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function es6Encoder(strings: TemplateStringsArray, values: unknown[], encoder: ValueEncoder): string {
    let result = strings[0];

    for (let i = 0; i < values.length; ++i) {
        result += encoder(String(values[i]), i) + strings[i + 1];
    }

    return result;
}

export function esxxEncoder(template: string, params: Params, encoder: ValueEncoder): string {
    return template.replace(/(^|[^\\])(\\\\)*{([^{}[\]()"'`\s]+)}/g, (match) => {
        const start = match.lastIndexOf('{');
        const param = match.substring(start + 1, match.length - 1);
        const value = params[param];

        return match.substring(0, start) + encoder(String(value), param);
    });
}

export function isTemplateStringsLike(strings: any): strings is TemplateStringsArray;
export function isTemplateStringsLike(strings: TemplateStringsArray): strings is TemplateStringsArray {
    return Array.isArray(strings) && strings.every((s) => typeof s === 'string');
}

export function b64Decode(b64: string): string {
    return Buffer.from(b64, 'base64').toString();
}

export function b64Encode(str: string): string {
    return Buffer.from(str).toString('base64');
}

export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
