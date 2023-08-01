import { ContentType } from '@divine/headers';
import { URI } from '../../src';

describe('data URIs', () => {
    const briefNote = new URI('data:,A%20brief%20note');
    const jsonNote  = new URI('data:application/json;base64,eyJ0aXRsZSI6IkEgYnJpZWYgbm90ZSIsImJvZHkiOiJEb24ndCBmb3JnZXQgdG8gYnV5IG1pbGsgb24geW91ciB3YXkgaG9tZS4ifQ==');
    const greekChar = new URI('data:text/plain;charset=iso-8859-7,%be%d3%be');
    const typeParam = new URI('data:text/plain;foo=%22bar;charset=iso-8859-1%22;charset=UTF-8,%c3%85');

    it('supports info', async () => {
        expect.assertions(4);

        expect(await briefNote.info()).toStrictEqual({
            uri:    briefNote,
            name:   '',
            type:   ContentType.create('text/plain; charset=US-ASCII'),
            length: 12,
        });

        expect(await jsonNote.info()).toStrictEqual({
            uri:    jsonNote,
            name:   '',
            type:   ContentType.json,
            length: 76,
        });

        expect(await greekChar.info()).toStrictEqual({
            uri:    greekChar,
            name:   '',
            type:   ContentType.create('text/plain; charset=iso-8859-7'),
            length: 3,
        });

        expect(await typeParam.info()).toStrictEqual({
            uri:    typeParam,
            name:   '',
            type:   ContentType.create('text/plain; foo="bar;charset=iso-8859-1"; charset=UTF-8'),
            length: 2,
        });
    });

    it('loads', async () => {
        expect.assertions(4);

        expect(String(await briefNote.load())).toStrictEqual('A brief note');
        expect(await jsonNote.load()).toStrictEqual({
            title: 'A brief note',
            body:  "Don't forget to buy milk on your way home.",
        });
        expect(String(await greekChar.load())).toStrictEqual('ΎΣΎ');
        expect(String(await typeParam.load())).toStrictEqual('Å');
    });

    it('saves', async () => {
        expect.assertions(6);

        const briefNote2 = new URI(briefNote);
        const jsonNote2  = new URI(jsonNote);
        const greekChar2 = new URI(greekChar);
        const typeParam2 = new URI(typeParam);

        // Keep existing content-type
        await briefNote2.save('Another brief note');
        await jsonNote2.save({ title: 'Another brief note', body: 'This is a new body.' });
        await greekChar2.save('ΑΒΓΔΕ');
        await typeParam2.save('Ö');

        expect(briefNote2.href).toStrictEqual('data:text/plain;charset=US-ASCII,Another%20brief%20note');
        expect(jsonNote2.href).toStrictEqual('data:application/json;base64,eyJ0aXRsZSI6IkFub3RoZXIgYnJpZWYgbm90ZSIsImJvZHkiOiJUaGlzIGlzIGEgbmV3IGJvZHkuIn0=');
        expect(greekChar2.href).toStrictEqual('data:text/plain;charset=iso-8859-7,%C1%C2%C3%C4%C5');
        expect(typeParam2.href).toStrictEqual('data:text/plain;foo=%22bar;charset=iso-8859-1%22;charset=UTF-8,%C3%96');

        // Update content-type
        await greekChar2.save('ΑΒΓΔΕ', 'text/foo');
        await typeParam2.save('Ö', 'text/bar;charset=iso-8859-1');

        expect(greekChar2.href).toStrictEqual('data:text/foo,%CE%91%CE%92%CE%93%CE%94%CE%95');
        expect(typeParam2.href).toStrictEqual('data:text/bar;charset=iso-8859-1,%D6');
    });

    it('appends', async () => {
        expect.assertions(4);

        const percent = new URI('data:,Hello');
        const base64  = new URI('data:text/plain;base64,SGVsbG8=');

        // Keep existing/default content-type
        await percent.append(' world');
        await base64.append(' world');

        expect(percent.href).toStrictEqual('data:text/plain;charset=US-ASCII,Hello%20world');
        expect(base64.href).toStrictEqual('data:text/plain;base64,SGVsbG8gd29ybGQ=');

        // Update content-type
        await percent.append('! 😀', 'text/foo'); // Will also switch to default charset, which is UTF-8
        await base64.append('! 😀', 'text/bar');

        expect(percent.href).toStrictEqual('data:text/foo,Hello%20world%21%20%F0%9F%98%80');
        expect(base64.href).toStrictEqual('data:text/bar;base64,SGVsbG8gd29ybGQhIPCfmIA=');
    });
});
