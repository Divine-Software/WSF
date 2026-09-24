import { Accept, AcceptCharset, AcceptEncoding, AcceptLanguage } from '../src';

describe.each([Accept, AcceptCharset, AcceptEncoding, AcceptLanguage,])('the %p class', (HeaderClass) => {
    it('handles empty headers', () => {
        expect.assertions(7);

        const accept = HeaderClass.create(',foo/bar,,val,');

        expect(accept).toHaveLength(2);
        expect(accept[0].type).toBe('foo/bar');
        expect(accept[1].type).toBe('val');

        expect(HeaderClass.create(undefined)).toBeUndefined();
        expect(HeaderClass.create('')).toHaveLength(0);
        expect(HeaderClass.create(',')).toHaveLength(0);
        expect(HeaderClass.create(' , , ')).toHaveLength(0);
    })
});
