/// <reference lib="dom" /> Required for fetch
import { WebArguments, WebResource, WebServer, WebService } from '../src';

describe('The WebServer', () => {
    it('should keep track of initial and default services', () => {
        expect.assertions(9);

        const svc1 = new WebService(1);
        const svc2 = new WebService("string");
        const svc3 = new WebService({});

        const srv1 = new WebServer('localhost', 7357, svc1);
        const srv2 = new WebServer(new URL('http://localhost:7357'), undefined, svc2);
        const srv3 = new WebServer(new URL('http://localhost:7357/mnt/'), undefined, svc3);

        const ctx1: number = srv1.initialService.context;
        const ctx2: string = srv2.initialService.context;
        const ctx3: object = srv3.initialService.context;

        expect(srv1.initialService).toBe(svc1);
        expect(srv2.initialService).toBe(svc2);
        expect(srv3.initialService).toBe(svc3);

        expect(srv1.defaultService).toBe(srv1.initialService);
        expect(srv2.defaultService).toBe(srv2.initialService);
        expect(srv3.defaultService).not.toBe(srv3.initialService);

        expect(ctx1).toBe(1);
        expect(ctx2).toBe("string");
        expect(ctx3).toEqual({});
    });

    it('should be able to dispatch a request and return a response', async () => {
        expect.assertions(2);

        const srv = new WebServer('localhost', 7357, new WebService(null, {
                console: {},
            }).addResource(class implements WebResource {
                static path = /hello/;

                async GET(args: WebArguments) {
                    return `Hello, ${args.string('?who', 'World')}!`;
                }
            }));

        try {
            await srv.start();

            expect(await (await fetch('http://localhost:7357/hello')).text()).toBe('Hello, World!');
            expect(await (await fetch('http://localhost:7357/hello?who=there')).text()).toBe('Hello, there!');
        } finally {
            await srv.stop();
        }
    });
});
