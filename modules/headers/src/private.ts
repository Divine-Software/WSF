/* eslint-disable jsdoc/require-jsdoc */

export function Record(): { [k: string]: any; } {
    return Object.create(null, {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        [Symbol.toPrimitive]: { value: Object.prototype.toString },
        [Symbol.toStringTag]: { value: 'Record' }
    });
}
