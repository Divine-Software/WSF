export type Constructor<T> = new (...args: any[]) => T;
export type ValueEncoder = (value: string, key: string | number) => string;

export type BasicTypes = boolean | number | bigint | string | object | null;

export interface Params extends Record<string, BasicTypes | undefined> {}
export interface StringParams extends Record<string, string | undefined> {}
