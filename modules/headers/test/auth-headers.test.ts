import { AuthHeader, Authorization, WWWAuthenticate } from '../src';

describe('the AuthScheme class', () => {
    it('handles empty headers', () => {
        expect.assertions(7);

        const auths = WWWAuthenticate.create(',Dummy,,Basic,');

        expect(auths).toHaveLength(2);
        expect(auths[0].scheme).toBe('dummy');
        expect(auths[1].scheme).toBe('basic');

        expect(WWWAuthenticate.create(undefined)).toBeUndefined();
        expect(WWWAuthenticate.create('')).toHaveLength(0);
        expect(WWWAuthenticate.create(',')).toHaveLength(0);
        expect(WWWAuthenticate.create(' , , ')).toHaveLength(0);
    })

    it('parses Basic credentials', () => {
        expect.assertions(4);

        const auth = new Authorization('Basic Zm9vOmJhcjpubw==');

        expect(auth instanceof AuthHeader).toBe(true);
        expect(auth.headerName).toBe('authorization');
        expect(auth.scheme).toBe('basic');
        expect(auth.credentials).toBe('Zm9vOmJhcjpubw==');
    })

    it('parses imagined Params credentials', () => {
        expect.assertions(9);

        const auths = WWWAuthenticate.create('Params a=A,b="B",  C   =  " C " ,d=",D" e="\\"E\\\\\\"\\\\" ,');
        const auth = auths[0];

        expect(auths).toHaveLength(1);
        expect(auth instanceof AuthHeader).toBe(true);
        expect(auth.scheme).toBe('params');
        expect(auth.param('a')).toBe('A');
        expect(auth.param('b')).toBe('B');
        expect(auth.param('c')).toBe(' C ');
        expect(auth.param('d')).toBe(',D');
        expect(auth.param('e')).toBe('"E\\"\\');

        expect(auth.toString()).toBe('Params a=A, b="B", C=" C ", d=",D", e="\\"E\\\\\\"\\\\"');
    })
});
