
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function as<T>(value: T): T {
    return value;
}

export function isOneOf<T extends string | number, V extends T[]>(value: T | undefined, of: V): boolean {
    return value !== undefined && of.includes(value);
}

export function throwError(err: Error): never {
    throw err;
}

export function setProp<T extends object, K extends keyof T>(object: T, prop: K, value: T[K]): T {
    object[prop] = value;
    return object;
}

export function getOrSetEntry<K, V>(map: Map<K, V>, key: K, value: V): V {
    const result = map.get(key);

    if (result !== undefined) {
        return result;
    } else {
        return map.set(key, value), value;
    }
}

export function isDOMNode(obj: unknown): boolean {
    return !!obj && typeof (obj as any).nodeType === 'number'; /* FIXME */
}

export function isXML(obj: unknown): boolean {
    return isDOMNode(obj) || typeof (obj as any)?.$domNode === 'function';
}

export function isHTML(obj: unknown): boolean {
    if (isXML(obj)) {
        const dom = isDOMNode(obj) ? obj : (obj as any)?.$domNode();
        const uri = dom?.namespaceURI ?? dom?.ownerElement?.namespaceURI ?? dom?.ownerDocument?.documentElement?.namespaceURI;

        return uri === 'http://www.w3.org/1999/xhtml';
    }
    else {
        return false;
    }
}

export function isJSON(obj: unknown): boolean {
    return !!obj && (Object.getPrototypeOf(obj) === Array.prototype || Object.getPrototypeOf(obj) === Object.prototype);
}
