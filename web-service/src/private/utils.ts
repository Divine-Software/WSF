/* eslint-disable jsdoc/require-jsdoc */

const PATCHED_CONSOLE_METHODS = [
    /* Console */    'assert', 'debug', 'dirxml', 'error', 'group', 'groupCollapsed', 'info', 'log', 'timeLog', 'trace', 'warn',
    /* SysConsole */ 'alert', 'crit', 'emerg', 'notice',
].reduce((map, fn) => (map[fn] = true, map), {} as { [fn: string]: true | undefined });

export function decorateConsole(console: Console, tag: string): Console {
    return new Proxy(console, {
        get: (target, p: string, receiver) => {
            const value = Reflect.get(target, p, receiver);

            if (typeof value === 'function' && PATCHED_CONSOLE_METHODS[p]) {
                return function (this: unknown, ...args: unknown[]) { return value.call(this, ...args, tag); };
            }
            else {
                return value;
            }
        }
    });
}

export const CONNECTION_CLOSING = Symbol('CONNECTION_CLOSING');

export type WithConnectionClosing<T> = T & {
    [CONNECTION_CLOSING]?: boolean;
}
