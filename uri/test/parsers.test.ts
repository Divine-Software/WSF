import { ContentType } from '@divine/headers';
import { Parser } from '../src';
import { Readable } from 'stream';

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
        expect(ct.toString()).toBe("application/x-custom;charset=\"UTF-16\"");
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
})
