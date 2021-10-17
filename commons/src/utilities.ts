
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

export function isDOMNode(obj: unknown): boolean {
    return !!obj && typeof (obj as any).nodeType === 'number'; /* FIXME */
}

export function isJSON(obj: unknown): boolean {
    return !!obj && (Object.getPrototypeOf(obj) === Array.prototype || Object.getPrototypeOf(obj) === Object.prototype);
}
