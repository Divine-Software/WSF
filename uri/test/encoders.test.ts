import { randomBytes } from 'crypto';
import { Base64Encoder, Encoder } from '../src';

async function* randomChunkSize(source: Buffer) {
    for (let offset = 0; offset < source.length;) {
        const length = Math.min(source.length - offset, Math.round(Math.random() * 1024));

        yield source.slice(offset, offset + length);

        offset += length;
    }
}

async function join(stream: AsyncIterable<Buffer>): Promise<Buffer> {
    const buffers = [];

    for await (const chunk of stream) {
        buffers.push(chunk);
    }

    return Buffer.concat(buffers);
}

describe('the Encoder class', () => {
    const encodings = [
        '7bit',
        '8bit',
        'base64',
        'base64url',
        'binary',
        'br',
        'deflate',
        'gzip',
        'identity',
        'quoted-printable',
        'x-gzip',
    ];

    it.each(encodings)('encodes and decodes binary data as %s', async (encoding) => {
        expect.assertions(1);

        const data = randomBytes(Math.round(Math.random() * 8192));
        const result = await join(Encoder.decode(Encoder.encode(randomChunkSize(data), encoding), encoding));

        expect(result).toStrictEqual(data);
    });

    it.each(encodings)('encodes and decodes text data as %s', async (encoding) => {
        expect.assertions(1);

        const data = Buffer.from(randomBytes(Math.round(Math.random() * 8192)).toString('base64').replace(/\//g, '\r\n').replace(/\+/g, ' '));
        const result = await join(Encoder.decode(Encoder.encode(randomChunkSize(data), encoding), encoding));

        expect(result).toStrictEqual(data);
    });

    it('encodes quoted-printable whitespace', async () => {
        expect.assertions(4);

        expect(await join(Encoder.encode('',     'quoted-printable'))).toStrictEqual(Buffer.from(''));
        expect(await join(Encoder.encode('\n',   'quoted-printable'))).toStrictEqual(Buffer.from('=0A'));
        expect(await join(Encoder.encode('\r',   'quoted-printable'))).toStrictEqual(Buffer.from('=0D'));
        expect(await join(Encoder.encode('\r\n', 'quoted-printable'))).toStrictEqual(Buffer.from('\r\n'));
    })

    it('decodes quoted-printable whitespace', async () => {
        expect.assertions(4);

        expect(await join(Encoder.decode('',     'quoted-printable'))).toStrictEqual(Buffer.from(''));
        expect(await join(Encoder.decode('=0A',  'quoted-printable'))).toStrictEqual(Buffer.from('\n'));
        expect(await join(Encoder.decode('=0D',  'quoted-printable'))).toStrictEqual(Buffer.from('\r'));
        expect(await join(Encoder.decode('\r\n', 'quoted-printable'))).toStrictEqual(Buffer.from('\r\n'));
    });
});
