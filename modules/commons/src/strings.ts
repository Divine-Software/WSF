/* eslint-disable jsdoc/require-jsdoc */

export function percentEncode(str: string): string {
    return encodeURIComponent(str)
        .replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function toStringOrUndefined(value: unknown | null | undefined): string | undefined {
    return value === null || value === undefined ? undefined : toString(value);
}

export function toString(value: unknown) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    else {
        return String(value);
    }
}

export function esxxEncoder(template: string, params: Record<string, unknown>, encoder: (value: string, key: string | number) => string): string {
    return template.replace(/(^|[^\\])(\\\\)*{([^{}[\]()"'`\s]+)}/g, (match) => {
        const start = match.lastIndexOf('{');
        const param = match.substring(start + 1, match.length - 1);
        const value = params[param];

        return match.substring(0, start) + encoder(toString(value), param);
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
