import { ContentDisposition, ContentType } from '@divine/headers';
import { Parser, FormData, FIELDS, MultiPartData, CacheURI, MimeMessage } from '../../src';

describe('the FormParser class', () => {
    const ct = 'application/x-www-form-urlencoded';

    it('handles empty input', async () => {
        expect.assertions(6);

        const empty = await Parser.parse<FormData>('', ct);
        expect(Object.keys(empty)).toHaveLength(0);
        expect(empty[FIELDS]).toHaveLength(0);

        const qmark = await Parser.parse<FormData>('?', ct);
        expect(Object.keys(qmark)).toHaveLength(0);
        expect(qmark[FIELDS]).toHaveLength(0);

        const delim = await Parser.parse<FormData>('?&&&', ct);
        expect(Object.keys(delim)).toHaveLength(0);
        expect(delim[FIELDS]).toHaveLength(0);
    });

    it('parses query strings', async () => {
        expect.assertions(13);

        const parsed = await Parser.parse<FormData>('?foo&bar=&dupe=1%201&dupe=2+2', ct);
        expect(Object.keys(parsed)).toHaveLength(3);
        expect(parsed[FIELDS]).toHaveLength(4);

        expect(parsed['foo']).toBe('');
        expect(parsed['bar']).toBe('');
        expect(parsed['dupe']).toBe('1 1');

        expect(parsed[FIELDS]?.[0].name).toBe('foo');
        expect(parsed[FIELDS]?.[0].value).toBe('');
        expect(parsed[FIELDS]?.[1].name).toBe('bar');
        expect(parsed[FIELDS]?.[1].value).toBe('');
        expect(parsed[FIELDS]?.[2].name).toBe('dupe');
        expect(parsed[FIELDS]?.[2].value).toBe('1 1');
        expect(parsed[FIELDS]?.[3].name).toBe('dupe');
        expect(parsed[FIELDS]?.[3].value).toBe('2 2');
    });

    it('serializes empty objects', async () => {
        expect.assertions(4);

        const [ empty1 ] = (await Parser.serializeToBuffer({}, ct))
        expect(empty1.toString()).toBe('');

        const [ empty2 ] = (await Parser.serializeToBuffer({ [FIELDS]: undefined }, ct));
        expect(empty2.toString()).toBe('');

        const [ empty3 ] = (await Parser.serializeToBuffer({ [FIELDS]: null }, ct));
        expect(empty3.toString()).toBe('');

        const [ empty4 ] = (await Parser.serializeToBuffer({ [FIELDS]: [] }, ct));
        expect(empty4.toString()).toBe('');
    });

    it('serializes query strings', async () => {
        expect.assertions(3);

        const [ object ] = (await Parser.serializeToBuffer({ 'a': 10, b: 'string & space', c: null, d: undefined, e: [ 'array', 'items'] }, ct))
        expect(object.toString()).toBe('a=10&b=string+%26+space&c=null&d=undefined&e=array%2Citems');

        const formdata: FormData = {
            [FIELDS]: [
                { name: 'a', value: 10 as any },
                { name: 'b', value: 'string & space' },
                { name: 'c', value: null as any },
                { name: 'd', value: undefined as any },
                { name: 'e', value: 'array' },
                { name: 'e', value: 'items' },
            ]
        };

        const [ fields ] = (await Parser.serializeToBuffer({ 'ignored': '10', ...formdata }, ct));
        expect(fields.toString()).toBe('a=10&b=string+%26+space&c=null&d=undefined&e=array&e=items');

        const [ array ] = (await Parser.serializeToBuffer(formdata[FIELDS], ct));
        expect(array.toString()).toBe(fields.toString());
    });
})

const boundary  = 'foobar';
const multipart = `preamble
--${boundary}

Headerless text
--${boundary}
content-type: text/csv;x-header="present"

name,value
foo,bar
--${boundary}
Content-Type: application/octet-stream
content-disposition: form-data
content-transfer-encoding: base64

SGVsbG8gLW4K
--${boundary}--
epilogue`.replace(/\n/g, '\r\n');

describe('the MultiPartParser class', () => {
    const ct = `multipart/foobar; boundary=${boundary}`;

    it('decodes & re-encodes multipart data', async () => {
        expect.assertions(6);

        const decoded = await Parser.parse<MultiPartData>(multipart, ct);
        expect(decoded[FIELDS]![0].headers).toStrictEqual({});
        expect(decoded[FIELDS]![0].value).toBe(`Headerless text`);
        expect(decoded[FIELDS]![1].value).toBeInstanceOf(CacheURI);
        expect(decoded[FIELDS]![2].value).toBeInstanceOf(Buffer);

        const [ encoded1 ] = await Parser.serializeToBuffer(decoded, ct);
        expect(`preamble${encoded1}epilogue`).toBe(multipart.replace('Content-Type', 'content-type'));

        const [ encoded2 ] = await Parser.serializeToBuffer(decoded[FIELDS], ct);
        expect(encoded2.toString()).toBe(encoded1.toString());
    });
});

const javamail = `
content-type: text/plain;
	name*=UTF-8''Hall%C3%A5%20d%C3%A4r%20%F0%9F%98%80
content-disposition: inline;
	filename*=UTF-8''Hall%C3%A5%20d%C3%A4r%20%F0%9F%98%80
content-transfer-encoding: binary

Body
`.replace(/\n/g, '\r\n').trimStart();

describe('the MessageParser class', () => {
    it('decodes JavaMail messages correctly', async () => {
        expect.assertions(7);

        const decoded = await Parser.parse<MimeMessage>(javamail, 'message/*');
        expect(decoded.type.type).toBe('text/plain');
        expect(decoded.type.param('name')).toBe('Hallå där 😀');
        expect(decoded.value).toBe('Body\r\n');

        const ct = ContentType.create(decoded.headers['content-type']);
        const cd = ContentDisposition.create(decoded.headers['content-disposition']);

        expect(ct.type).toBe('text/plain');
        expect(ct.param('name')).toBe('Hallå där 😀');

        expect(cd.type).toBe('inline');
        expect(cd.filename).toBe('Hallå där 😀');
    });
});

