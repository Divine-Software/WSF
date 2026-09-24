import { recordify } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { Readable } from 'stream';
import { Parser } from '../src';

describe('the Parser class', () => {
    const buffer = Buffer.from("Hi there 🫥");

    it('serializes Buffer/string/undefined as Buffer', async () => {
        expect.assertions(8);

        let [ result, ct ] = Parser.serialize(buffer);
        expect(result).toBe(buffer);
        expect(ct).toStrictEqual(ContentType.bytes);

        [ result, ct ] = Parser.serialize(buffer.toString());
        expect(result).toStrictEqual(buffer);
        expect(ct).toStrictEqual(ContentType.text);

        [ result, ct ] = Parser.serialize(buffer.toString(), "application/x-custom; charset=UTF-16");
        expect(result).toStrictEqual(Buffer.from(buffer.toString(), "utf16le"));
        expect(ct.toString()).toBe("application/x-custom;charset=UTF-16");

        [ result, ct ] = Parser.serialize(undefined);
        expect(result).toStrictEqual(Buffer.alloc(0));
        expect(ct).toStrictEqual(ContentType.bytes);
    });

    it('passes ReadableStream right through', async () => {
        expect.assertions(2);

        async function *stream() {
            yield 'Hi ';
            yield 'there ';
            yield '🫥';
        }

        const [ readable ] = Parser.serialize(Readable.from(stream()));
        expect(readable).toBeInstanceOf(Readable);

        const result = await Parser.parse(readable, ContentType.bytes);
        expect(result).toStrictEqual(buffer);
    });

    it('serializes AsyncIterable streams', async () => {
        expect.assertions(1);

        async function *stream() {
            yield { data: 'Hi ' };
            yield { data: '\nthere ' };
            yield { data: '🫥\n' };
        }

        const [ result ] = await Parser.serializeToBuffer(stream(), 'text/event-stream');
        expect(result.toString()).toBe('data: Hi \n\ndata: \ndata: there \n\ndata: 🫥\ndata: \n\n');
    });

    it.each(['application/json', 'application/toml', 'application/yaml'])('roundtrips supported datatypes exactly in %s messages', async (ct) => {
        expect.assertions(7);

        const data = recordify({
            arrays:    [],
            boolean:   [true, false],
            date:      new Date(),
            integer:   { small: 32n, big: 10000000000000000000000000000000000000000000000000000000000000000000000000000n },
            nested:    [[{}]],
            null:      null,
            numbers:   { int: 42, decimal: 3.14, large: 1e20, exp: 1e32, max: Number.MAX_VALUE, nan: NaN, inf: -Infinity },
            undefined: undefined,
            unicode:   "Hi there 🫥 🙋🏼‍♀️",
        });

        const serdes = await Parser.parse<typeof data>(...Parser.serialize(data, ct))

        // JSON and YAML do not support Date objects
        expect(Object(serdes.date)).toBeInstanceOf(ct === 'application/json' || ct === 'application/yaml' ? String : Date /* TomlDate, actually */);
        expect(serdes.date.toISOString?.() ?? serdes.date).toBe(data.date.toISOString());
        serdes.date = new Date(serdes.date);

        // TOML does not support null values
        expect(serdes.null).toBe(ct === 'application/toml' ? undefined : null);
        serdes.null = null;

        // JSON does not support Infinity or NaN values
        expect(serdes.numbers.inf).toBe(ct === 'application/json' ? null : -Infinity);
        expect(serdes.numbers.nan).toBe(ct === 'application/json' ? null : NaN);
        serdes.numbers.inf = -Infinity;
        serdes.numbers.nan = NaN;

        // No parser supports `undefined` values
        expect(serdes).not.toHaveProperty('undefined');
        serdes.undefined = undefined;

        expect(serdes).toStrictEqual(data);
    });

    it.each(['application/json', 'application/toml', 'application/yaml'])('%s can opt out of default integer handling', async (ct) => {
        expect.hasAssertions();

        const data = { big: 42n, int: 42, dec: 4.2 };

        Parser.integers = true;
        const serdes1 = await Parser.withIntegers(false).parse<typeof data>(...Parser.withIntegers(false).serialize(data , ct));
        expect(serdes1.big).toBe(42)
        expect(serdes1.int).toBe(42)
        expect(serdes1.dec).toBe(4.2)

        Parser.integers = false;
        const serdes2 = await Parser.withIntegers(true).parse<typeof data>(...Parser.withIntegers(true).serialize(data , ct));
        expect(serdes2.big).toBe(42n)
        expect(serdes2.int).toBe(42)
        expect(serdes2.dec).toBe(4.2)

        const serdes3 = await Parser.parse<typeof data>(...Parser.serialize(data , ct));
        expect(serdes3.big).toBe(42)
        expect(serdes3.int).toBe(42)
        expect(serdes3.dec).toBe(4.2)

        Parser.integers = true;
        const serdes4 = await Parser.parse<typeof data>(...Parser.serialize(data , ct));
        expect(serdes4.big).toBe(42n)
        expect(serdes4.int).toBe(42)
        expect(serdes4.dec).toBe(4.2)
    })
})
