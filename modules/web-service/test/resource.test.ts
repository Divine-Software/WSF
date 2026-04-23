import { Record } from '@divine/commons';
import { WebArguments, WebError, WebResponse, WebStatus } from '../src';
import { fakedReq } from './test-utils';

const toml = `
number  = 1.0
integer = 2
string  = 'STRING'
array   =  [ 3, 4 ]
date    = 2020-03-10T13:39:00.000Z
datestr = '2020-03-10T13:39:00.000Z'
true    = true
false   = false

[object]
string  = 'member'
array   = [ 1, 2.0, 3.5 ]
`;

describe('the WebArguments class', () => {
    const args = new WebArguments({ urlparam: 'url' },
        fakedReq('GET', '/?num=1&str=string&date=2020-03-10&large=999999&t1=t&t2=true&f1=f&f2=false', {
            'header': ['value1', 'value2' ],
            'content-type': 'application/toml'
        }, Buffer.from(toml)));
    const body = args.body();

    it('handles boolean arguments', async () => {
        expect.assertions(18);
        await body;

        expect(() => args.boolean('$urlparam')).toThrow(WebError);
        expect(() => args.boolean('?num')).toThrow(WebError);
        expect(() => args.boolean('?str')).toThrow(WebError);
        expect(() => args.boolean('?date')).toThrow(WebError);
        expect(args.boolean('?t1')).toBe(true);
        expect(args.boolean('?t2')).toBe(true);
        expect(args.boolean('?f1')).toBe(false);
        expect(args.boolean('?f2')).toBe(false);
        expect(() => args.boolean('@header')).toThrow(WebError);
        expect(() => args.boolean('.number')).toThrow(WebError);
        expect(() => args.boolean('.integer')).toThrow(WebError);
        expect(() => args.boolean('.string')).toThrow(WebError);
        expect(() => args.boolean('.object')).toThrow(WebError);
        expect(() => args.boolean('.array')).toThrow(WebError);
        expect(() => args.boolean('.date')).toThrow(WebError);
        expect(() => args.boolean('.datestr')).toThrow(WebError);
        expect(args.boolean('.true')).toBe(true);
        expect(args.boolean('.false')).toBe(false);
    });

    it('handles date arguments', async () => {
        expect.assertions(16);
        await body;

        expect(() => args.date('$urlparam')).toThrow(WebError);
        expect(() => args.date('?num')).toThrow(WebError);
        expect(() => args.date('?str')).toThrow(WebError);
        expect(args.date('?date')).toStrictEqual(new Date('2020-03-10T00:00:00.000Z'));
        expect(() => args.date('?large')).toThrow(WebError);
        expect(() => args.date('@header')).toThrow(WebError);
        expect(() => args.date('.number')).toThrow(WebError);
        expect(() => args.date('.integer')).toThrow(WebError);
        expect(() => args.date('.string')).toThrow(WebError);
        expect(() => args.date('.object')).toThrow(WebError);
        expect(() => args.date('.array')).toThrow(WebError);
        expect(args.date('.date')).toBeInstanceOf(Date /* TomlDate */);
        expect(args.date('.date').toISOString()).toBe('2020-03-10T13:39:00.000Z');
        expect(args.date('.datestr')).toStrictEqual(new Date('2020-03-10T13:39:00.000Z'));
        expect(() => args.date('.true')).toThrow(WebError);
        expect(() => args.date('.false')).toThrow(WebError);
    });

    it('handles number arguments', async () => {
        expect.assertions(14);
        await body;

        expect(() => args.number('$urlparam')).toThrow(WebError);
        expect(args.number('?num')).toBe(1);
        expect(() => args.number('?str')).toThrow(WebError);
        expect(() => args.number('?date')).toThrow(WebError);
        expect(() => args.number('@header')).toThrow(WebError);
        expect(args.number('.number')).toBe(1);
        expect(args.number('.integer')).toBe(2);
        expect(() => args.number('.string')).toThrow(WebError);
        expect(() => args.number('.object')).toThrow(WebError);
        expect(() => args.number('.array')).toThrow(WebError);
        expect(() => args.number('.date')).toThrow(WebError);
        expect(() => args.number('.datestr')).toThrow(WebError);
        expect(() => args.number('.true')).toThrow(WebError);
        expect(() => args.number('.false')).toThrow(WebError);
    });

    it('handles integer arguments', async () => {
        expect.assertions(14);
        await body;

        expect(() => args.integer('$urlparam')).toThrow(WebError);
        expect(args.integer('?num')).toBe(1n);
        expect(() => args.integer('?str')).toThrow(WebError);
        expect(() => args.integer('?date')).toThrow(WebError);
        expect(() => args.integer('@header')).toThrow(WebError);
        expect(args.integer('.number')).toBe(1n);
        expect(args.integer('.integer')).toBe(2n);
        expect(() => args.integer('.string')).toThrow(WebError);
        expect(() => args.integer('.object')).toThrow(WebError);
        expect(() => args.integer('.array')).toThrow(WebError);
        expect(() => args.integer('.date')).toThrow(WebError);
        expect(() => args.integer('.datestr')).toThrow(WebError);
        expect(() => args.integer('.true')).toThrow(WebError);
        expect(() => args.integer('.false')).toThrow(WebError);
    });

    it('handles string arguments', async () => {
        expect.assertions(14);
        await body;

        expect(args.string('$urlparam')).toBe('url');
        expect(args.string('?num')).toBe('1');
        expect(args.string('?str')).toBe('string');
        expect(args.string('?date')).toBe('2020-03-10');
        expect(args.string('@header')).toBe('value1, value2');
        expect(args.string('.number')).toBe('1');
        expect(args.string('.integer')).toBe('2');
        expect(args.string('.string')).toBe('STRING');
        expect(() => args.string('.object')).toThrow(WebError);
        expect(() => args.string('.array')).toThrow(WebError);
        expect(args.string('.date')).toBe('2020-03-10T13:39:00.000Z');
        expect(args.string('.datestr')).toBe('2020-03-10T13:39:00.000Z');
        expect(args.string('.true')).toBe('true');
        expect(args.string('.false')).toBe('false');
    });

    it('handles object arguments', async () => {
        expect.assertions(15);
        await body;

        expect(() => args.object('$urlparam')).toThrow(WebError);
        expect(() => args.object('?num')).toThrow(WebError);
        expect(() => args.object('?str')).toThrow(WebError);
        expect(() => args.object('?date')).toThrow(WebError);
        expect(() => args.object('@header')).toThrow(WebError);
        expect(() => args.object('.number')).toThrow(WebError);
        expect(() => args.object('.integer')).toThrow(WebError);
        expect(() => args.object('.string')).toThrow(WebError);
        expect(args.object('.object')).toStrictEqual(Record({ string: 'member', array: [ 1n, 2, 3.5 ] }));
        expect(args.object('.array')).toStrictEqual([ 3n, 4n ]);
        expect(args.object('.date')).toBeInstanceOf(Date /* TomlDate */);
        expect(args.object<Date>('.date').toISOString()).toBe('2020-03-10T13:39:00.000Z');
        expect(() => args.object('.datestr')).toThrow(WebError);
        expect(() => args.object('.true')).toThrow(WebError);
        expect(() => args.object('.false')).toThrow(WebError);
    });

    it('detects if values are passed or not', async () => {
        expect.assertions(5);

        const args = new WebArguments({}, fakedReq('GET', '/', {
            'content-type': 'application/json'
        }, Buffer.from(JSON.stringify({ null: null }))));
        await args.body();

        expect(args.has('.missing')).toBe(false);
        expect(args.has('.null')).toBe(true);
        expect(args.object('.null', globalThis)).toBe(globalThis);
        expect(args.object('.null', null)).toBeNull();
        expect(args.object('.null', undefined)).toBeUndefined();
    });

    it('handles missing values', async () => {
        expect.assertions(25);
        await body;

        expect(() => args.boolean('?missing')).toThrow(`Query parameter 'missing' is missing.`);
        expect(() => args.date('missing' as any)).toThrow(`Invalid parameter 'missing' is missing.`);
        expect(() => args.number('.missing')).toThrow(`Entity parameter 'missing' is missing.`);
        expect(() => args.integer('.missing')).toThrow(`Entity parameter 'missing' is missing.`);
        expect(() => args.string('@missing')).toThrow(`Request header 'missing' is missing.`);
        expect(() => args.object('$missing')).toThrow(`URL parameter 'missing' is missing.`);
        expect(() => args.object('~missing')).toThrow(`Custom parameter 'missing' is missing.`);

        expect(args.boolean('?missing', false)).toBe(false);
        expect(args.boolean('?missing', null)).toBeNull();
        expect(args.boolean('?missing', undefined)).toBeUndefined();

        const date = new Date();
        expect(args.date('?missing', date)).toBe(date);
        expect(args.date('?missing', null)).toBeNull();
        expect(args.date('?missing', undefined)).toBeUndefined();

        expect(args.number('?missing', 13)).toBe(13);
        expect(args.number('?missing', null)).toBeNull();
        expect(args.number('?missing', undefined)).toBeUndefined();

        expect(args.integer('?missing', 14n)).toBe(14n);
        expect(args.integer('?missing', null)).toBeNull();
        expect(args.integer('?missing', undefined)).toBeUndefined();

        expect(args.string('?missing', 'def')).toBe('def');
        expect(args.string('?missing', null)).toBeNull();
        expect(args.string('?missing', undefined)).toBeUndefined();

        const array = [42];
        expect(args.object('?missing', array)).toBe(array);
        expect(args.object('?missing', null)).toBeNull();
        expect(args.object('?missing', undefined)).toBeUndefined();
    });
});

describe('the WebResponse class', () => {
    it('can be serialized', async () => {
        expect.assertions(2);

        const req = fakedReq('GET', '/');
        const res = new WebResponse(WebStatus.OK, 'Hello, world!');

        expect(res.body).toBe('Hello, world!');
        await res.serialize(req);
        expect(res.body).toStrictEqual(Buffer.from('Hello, world!'));
    });
});
