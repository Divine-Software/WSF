import { Parser } from '@divine/uri';
import { IncomingHttpHeaders } from 'http';
import { Readable } from 'stream';
import { WebArguments, WebRequest, WebResponse, WebService, WebStatus } from '../src';
import { fakedReq } from './test-utils';

async function dispatchRequest<T>(ws: WebService<T>, request: WebRequest) {
    const response = await ws.dispatchRequest(request);
    return WebRequest.prototype['_serializeResponse'].call(request, response);
}

describe('the WebService dispatcher', () => {
    const ws = new WebService('context')
    .addResource(class {
        static path = /default/;

        constructor(context: string, args: WebArguments) {
            // eslint-disable-next-line jest/no-standalone-expect
            expect(args.request.url.href).toBe('http://localhost/default?foo');
            // eslint-disable-next-line jest/no-standalone-expect
            expect(context).toBe('context');
        }

        async default(args: WebArguments) {
            return `default ${args.request.method}`;
        }
    })
    .addResource(class {
        static path = /options/;

        async OPTIONS(args: WebArguments) {
            // eslint-disable-next-line jest/no-standalone-expect
            expect(args.request.method).toBe('OPTIONS');
            return `options ${args.request.method}`;
        }
    })
    .addResource(class {
        static path = /other/;

        async GET() {
            return null;
        }
    });

    it('dispatches custom HTTP verbs to the default handler', async () => {
        expect.assertions(4);

        const r1 = await dispatchRequest(ws, fakedReq('X-SPECIAL', '/default?foo'));
        expect(r1.status).toBe(WebStatus.OK);
        expect(r1.body!.toString()).toBe('default X-SPECIAL');
    });

    it('dispatches OPTIONS to the options handler', async () => {
        expect.assertions(3);

        const r2 = await dispatchRequest(ws, fakedReq('OPTIONS', '/options'));
        expect(r2.status).toBe(WebStatus.OK);
        expect(r2.body!.toString()).toBe('options OPTIONS');
    });

    it('handles OPTIONS automatically if there is no options handler', async () => {
        expect.assertions(3);

        const r3 = await dispatchRequest(ws, fakedReq('OPTIONS', '/other'));
        expect(r3.status).toBe(WebStatus.OK);
        expect(r3.body).toBeNull();
        expect(r3.headers['allow']).toBe('GET, HEAD, OPTIONS');
    });

    it('rejects with 405 if handler is missing', async () => {
        expect.assertions(1);
        jest.spyOn(console, 'warn').mockImplementation(() => void 0);

        expect((await dispatchRequest(ws, fakedReq('POST', '/options'))).status).toBe(WebStatus.METHOD_NOT_ALLOWED);
    });
});

describe(`a WebService's resources`, () => {
    async function *stream() {
        yield "A";
        yield "B";
    }

    const ws = new WebService('context')
        .addResource(class {
            static path = /GET\/(?<obj_id>\d)/;
            private _digit: number;

            constructor(_context: string, args: WebArguments) {
                // eslint-disable-next-line jest/no-standalone-expect
                expect(args.string('$1') === args.string('$obj_id')).toBe(true);
                this._digit = args.number('$1');
            }

            async GET(args: WebArguments) {
                // eslint-disable-next-line jest/no-standalone-expect
                expect(args.string('$1') === args.string('$obj_id')).toBe(true);

                switch (this._digit) {
                    case 0: return null;
                    case 1: return '1';
                    case 2: return [2];
                    case 3: return { value: 3 };
                    case 4: return new WebResponse(WebStatus.ACCEPTED, null);
                    case 5: return new WebResponse(WebStatus.ACCEPTED, 'five', { etag: 'V'}).setHeader('Custom-Header', 'v');
                    case 6: return stream();
                    case 7: return Readable.from(stream());
                    case 8: return ['Å', 'Ä', 'Ö'];
                    case 9: return { foo: ['bar', 'baz'] };
                    default: return 'default';
                }
            }
        });

    it('returns 204 for null repsonses (GET)', async () => {
        expect.assertions(4);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/0'));
        expect(r.status).toBe(WebStatus.NO_CONTENT);
        expect(r.body).toBeNull();
    });

    it('returns 204 for null repsonses (HEAD)', async () => {
        expect.assertions(4);

        const r = await dispatchRequest(ws, fakedReq('HEAD', '/GET/0'));
        expect(r.status).toBe(WebStatus.NO_CONTENT);
        expect(r.body).toBeNull();
    });

    it('returns strings as text/plain', async () => {
        expect.assertions(5);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/1'));
        expect(r.status).toBe(WebStatus.OK);
        expect(r.body!.toString()).toBe('1');
        expect(r.headers['content-type']?.toString()).toBe('text/plain');
    });

    it('returns arrays as application/json', async () => {
        expect.assertions(5);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/2'));
        expect(r.status).toBe(WebStatus.OK);
        expect(r.body!.toString()).toBe(JSON.stringify([2]));
        expect(r.headers['content-type']?.toString()).toBe('application/json');
    });

    it('returns objects as application/json', async () => {
        expect.assertions(5);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/3'));
        expect(r.status).toBe(WebStatus.OK);
        expect(r.body!.toString()).toBe(JSON.stringify({ value: 3 }));
        expect(r.headers['content-type']?.toString()).toBe('application/json');
    })

    it('can return 202 with no body', async () => {
        expect.assertions(4);

        const r4 = await dispatchRequest(ws, fakedReq('GET', '/GET/4'));
        expect(r4.status).toBe(WebStatus.ACCEPTED);
        expect(r4.body).toBeNull();
    });

    it('can return 202 with body and standard and custom headers', async () => {
        expect.assertions(6);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/5'));
        expect(r.status).toBe(WebStatus.ACCEPTED);
        expect(r.body!.toString()).toBe('five');
        expect(r.headers['etag']).toBe('V');
        expect(r.headers['custom-header']).toBe('v');
    });

    it('returns 404 or 405 if no resource matches', async () => {
        expect.assertions(5);
        jest.spyOn(console, 'warn').mockImplementation(() => void 0);

        expect((await dispatchRequest(ws, fakedReq('POST', '/GET/1'))).status).toBe(WebStatus.METHOD_NOT_ALLOWED);
        expect((await dispatchRequest(ws, fakedReq('GET', '/GET/)'))).status).toBe(WebStatus.NOT_FOUND);
        expect((await dispatchRequest(ws, fakedReq('GET', '/GET/A'))).status).toBe(WebStatus.NOT_FOUND);
        expect((await dispatchRequest(ws, fakedReq('GET', '/GET/10'))).status).toBe(WebStatus.NOT_FOUND);
    });

    it('returns AsyncIterable as SSE', async () => {
        expect.assertions(4);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/6'));
        expect(r.body).toBeInstanceOf(Readable);
        expect((await Parser.serializeToBuffer(r.body))[0].toString()).toBe('data: A\n\ndata: B\n\n');
    });

    it('returns ReadableStream as-is', async () => {
        expect.assertions(4);

        const r = await dispatchRequest(ws, fakedReq('GET', '/GET/7'));
        expect(r.body).toBeInstanceOf(Readable);
        expect((await Parser.serializeToBuffer(r.body))[0].toString()).toBe('AB');
    });

    it('negotiates content charset correctly', async () => {
        expect.assertions(18);

        const r = (headers: IncomingHttpHeaders) => dispatchRequest(ws, fakedReq('GET', '/GET/8', headers));
        expect((await r({accept: 'text/plain'})).body).toStrictEqual(Buffer.from('Å,Ä,Ö'));
        expect((await r({accept: 'text/plain;charset=latin1'})).body).toStrictEqual(Buffer.from('Å,Ä,Ö', 'latin1'));
        expect((await r({accept: 'text/plain', 'accept-charset': 'utf-8;q=.5, latin1'})).body).toStrictEqual(Buffer.from('Å,Ä,Ö', 'latin1'));
        expect((await r({accept: 'text/plain', 'accept-charset': 'utf-8;q=.5, foobar'})).body).toStrictEqual(Buffer.from('Å,Ä,Ö'));
        expect((await r({accept: 'text/plain', 'accept-charset': 'utf-8;q=.0, foobar'})).body).toStrictEqual(Buffer.from('Cannot provide a response as text/plain [utf-8;q=.0, foobar]'));
        expect((await r({accept: 'text/plain', 'accept-charset': 'utf-8;q=.0, foobar'})).status).toBe(WebStatus.NOT_ACCEPTABLE);
    });

    it('negotiates content-type correctly', async () => {
        expect.assertions(9);

        const r = (headers: IncomingHttpHeaders) => dispatchRequest(ws, fakedReq('GET', '/GET/9', headers));
        expect((await r({})).body).toStrictEqual(Buffer.from('{"foo":["bar","baz"]}'));
        expect((await r({'accept': 'application/toml;q=0.6,application/yaml;q=0.5'})).body).toStrictEqual(Buffer.from('foo = [ "bar", "baz" ]\n'));
        expect((await r({'accept': 'application/toml;q=0.4,application/yaml;q=0.5'})).body).toStrictEqual(Buffer.from('foo:\n  - bar\n  - baz\n'));
    });
});
