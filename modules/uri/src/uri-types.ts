/* eslint-disable @typescript-eslint/no-wrapper-object-types */

export type BasicTypes = boolean | number | bigint | string | object | null;

export interface Params extends Record<string, BasicTypes | undefined> {}
export interface StringParams extends Record<string, string | undefined> {}

/** Used in {@link WithFields} to attach field metadata to an object. */
export const FIELDS      = Symbol('FIELDS');

/** Used in {@link Finalizable} to attach a finializer function to an object. */
export const FINALIZE    = Symbol('FINALIZE');

/** Used in {@link Unwrappable} to store the original primitive value. */
export const UNWRAP      = Symbol('UNWRAP');

/** Used in {@link Metadata} to attach response headers to an object. */
export const HEADERS     = Symbol('HEADERS');

/** Used in {@link Metadata} to attach a response status code to an object. */
export const STATUS      = Symbol('STATUS');

/** Used in {@link Metadata} to attach a response status message to an object. */
export const STATUS_TEXT = Symbol('STATUS_TEXT');

/** Defines how response/result metadata is attached to an object. */
export interface Metadata {
    /** The response status. Example: the HTTP status or a Node.js `errno` value. */
    [STATUS]?:      number;

    /** The response status message. Example: the HTTP status text or a Node.js `code` value. */
    [STATUS_TEXT]?: string;

    /** Additional metadata as key-value pairs. Example: HTTP response headers. */
    [HEADERS]?:     StringParams;
}

/** Defines how a finalizer function is attached to an object. */
export interface Finalizable {
    /** A finalizer function, used to clean up temporary resources. */
    [FINALIZE]?: () => Promise<unknown>;
}

/**
 * Defines how field metadata is attached to an object.
 *
 * @template T The field type.
 */
export interface WithFields<T extends BasicTypes> {
    /** Defines how field information is attached to an object. */
    [FIELDS]?: T[];
}

/** Holds a wrapped value. */
export interface Unwrappable<T> {
    [UNWRAP]: T;
}

/** Wrap T as an object. */
export type Wrap<T>
    = T extends object    ? T
    : T extends string    ? Unwrappable<T> & String
    : T extends boolean   ? Unwrappable<T> & Boolean
    : T extends number    ? Unwrappable<T> & Number
    : T extends bigint    ? Unwrappable<T> & BigInt
    : T extends symbol    ? Unwrappable<T> & Symbol
                          : Unwrappable<T>;

/**
 * Wraps a value as an object, if it isn't already.
 *
 * `undefined` and `null` will be converted to empty, prototype-less objects. Primitives will be converted to their
 * built-in wrapper types via Object(value), which means that a `string` value will become a `String` object, a `number`
 * will become a `Number` instance, et cetera.
 *
 * In any case, the original value can be retrieved by calling {@link unwrap};
 *
 * @template T     The type of the value to convert.
 * @param    value The value to convert to an object.
 * @returns        The value converted to an object.
 */
export function wrap<T>(value: T): Wrap<T> {
    if (value === undefined || value === null) {
        return Object.create(null, {
            [UNWRAP]:             { value },
            [Symbol.toPrimitive]: { value: () => value },
            [Symbol.toStringTag]: { value: `Wrap<${value}>` },
        });
    } else if (typeof value === 'object') {
        return value as Wrap<T>;
    } else {
        return Object.defineProperty(Object(value), UNWRAP, { value });
    }
}

/**
 * Checks if a value is an object converted by {@link wrap}.
 *
 * @template T     The actual type returned.
 * @param    value The value to check.
 * @returns        Whether the value is an object converted by {@link wrap}.
 */
export function isWrapped<T>(value: T | Unwrappable<T>): value is Unwrappable<T> {
    return value !== null && typeof value === 'object' && UNWRAP in value;
}

/**
 * Restores an object created by {@link wrap} back into its original value.
 *
 * @template T      The actual type returned.
 * @param    value  The object that should be converted back to its original value.
 * @returns         The original value.
 */
export function unwrap<T>(value: T | Unwrappable<T>): T {
    return isWrapped(value) ? value[UNWRAP] : value;
}
