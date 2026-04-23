import { recordify } from '@divine/commons';
import { ContentType } from '@divine/headers';
import { Readable } from 'stream';
import { Parser } from '../src';

describe('the Parser class', () => {
    const buffer = Buffer.from("Hi there 🫥");

    it('serializes Buffer/string as Buffer', async () => {
        expect.assertions(6);

        let [ result, ct ] = Parser.serialize(buffer);
        expect(result).toBe(buffer);
        expect(ct).toStrictEqual(ContentType.bytes);

        [ result, ct ] = Parser.serialize(buffer.toString());
        expect(result).toStrictEqual(buffer);
        expect(ct).toStrictEqual(ContentType.text);

        [ result, ct ] = Parser.serialize(buffer.toString(), "application/x-custom; charset=UTF-16");
        expect(result).toStrictEqual(Buffer.from(buffer.toString(), "utf16le"));
        expect(ct.toString()).toBe("application/x-custom;charset=UTF-16");
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
})
