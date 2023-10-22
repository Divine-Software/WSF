import { escapeRegExp } from '@divine/commons';
import { once } from 'events';
import http, { IncomingMessage, ServerResponse } from 'http';
import http2, { Http2ServerRequest, Http2ServerResponse } from 'http2';
import https from 'https';
import { AddressInfo } from 'net';
import { WebService } from './service';

type RequestHandler = (request: IncomingMessage | Http2ServerRequest, response: ServerResponse | Http2ServerResponse) => Promise<void>;

/** Server options */
export type ServerOptions =
    http.ServerOptions        & { version?: 1 } |
    https.ServerOptions       & { version?: 1 } |
    http2.ServerOptions       & { version:  2 } |
    http2.SecureServerOptions & { version:  2 };

/** Start-up options for the {@link WebServer.start} method. */
export interface StartOptions {
    /**
     * Signals to listen for.
     *
     * A list of signals to listen for, `true` to listen for `SIGHUP`, `SIGINT`, `SIGTERM` and `SIGBREAK`, or `false` to
     * not register any signal handler at all. Default is `true`.
     */
    stopSignals?: boolean | NodeJS.Signals[];

    /** Set to `true` to automatically wait for {@link WebServer.stop} to be called. Defaults to `false`. */
    waitForStop?: boolean;
}

class WebServerBase {
    /** The underlying Node.js [Server](https://nodejs.org/api/http.html#class-httpserver) instance. */
    public readonly server: http.Server | https.Server | http2.Http2Server;

    /** The host name or IP address the server is listening on. */
    public get host(): string {
        return this.url.hostname;
    }

    /** The port number the server is listening on. */
    public get port(): number {
        return this.url.port ? Number(this.url.port) : this.url.protocol === 'http:' ? 80 : 443;
    }

    /** Information about the actual listening port, as provided by the Node.js [Server](https://nodejs.org/api/http.html#class-httpserver). */
    public get addressInfo(): AddressInfo | null {
        return this.server.address() as AddressInfo | null;
    }

    /**
     * @param url The URL this WebServer is listening on.
     */
    constructor(public readonly url: URL, serverOptions: ServerOptions, private readonly _requestHandler: RequestHandler) {
        if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.search || url.hash) {
            throw new TypeError('Invalid listen URL');
        }

        this.server = serverOptions?.version === 2
            ? url.protocol === 'http:'
                ? http2.createServer(serverOptions, _requestHandler)
                : http2.createSecureServer(serverOptions, _requestHandler)
            : url.protocol === 'http:'
                ? http.createServer(serverOptions, _requestHandler)
                : https.createServer(serverOptions, _requestHandler);
    }

    toString(): string {
        return `[${this.constructor.name}: ${this.url}]`;
    }

    /**
     * Starts the WebServer.
     *
     * Registers signal handlers (unless {@link StartOptions.stopSignals} is false) for automatic shutdown, and then starts
     * listening on the configured port.
     *
     * If {@link StartOptions.waitForStop} is `true`, {@link wait} is automatically invoked and this method will thus not
     * return until the server is stopped in that case.
     *
     * @param startOptions Start-up options.
     * @returns This WebServer.
     */
    async start(startOptions?: StartOptions): Promise<this> {
        const options: Required<StartOptions> = {
            stopSignals: true,
            waitForStop: false,

            ...startOptions
        };

        const signals: NodeJS.Signals[] =
            options.stopSignals === false ? [] :
            options.stopSignals === true  ? [ 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK' ] :
            options.stopSignals;

        const handler = (_signal: NodeJS.Signals) => {
            signals.forEach((s) => process.off(s, handler));
            this.stop().catch((err) => console.error(err));
        };

        signals.forEach((s) => process.once(s, handler));

        await once(this.server.listen(this.port, this.host), 'listening');

        return options.waitForStop ? this.wait() : this;
    }

    async stop(): Promise<this> {
        await new Promise<void>((resolve, reject) => {
            if (this.server.listening) {
                this.server.close((err) => err ? reject(err) : resolve());
            } else {
                resolve();
            }
        });

        return this;
    }

    /**
     * Waits until the WebServer is stopped.
     *
     * This method waits for {@link stop} to be called, either manually or indirectly by one of the signals that was
     * registered during the {@link start} method.
     *
     * @returns This WebServer.
     */
    async wait(): Promise<this> {
        if (this.server.address() !== null) {
            await once(this.server, 'close');
        }

        return this;
    }
}

/**
 * A web server that listens for incoming HTTP requests on a specific port and delegates requests to one or more
 * {@link WebService} instances.
 */
export class WebServer extends WebServerBase {
    /** The default WebService (the one mounted on '/'). */
    public readonly defaultService: WebService<any>;

    private _proxies: WebServerProxy[] = [];
    private _services: WebService<any>[] = [];
    private _mountPathPattern?: RegExp;
    private _requestHandlers!: RequestHandler[];

    constructor(host: string, port: number, defaultService?: WebService<any>);
    constructor(listen: URL, serverOptions?: ServerOptions , webService?: WebService<any>);
    constructor(url: string | URL, serverOptions: number | ServerOptions | undefined, webService?: WebService<any>) {
        if (typeof url === 'string' && typeof serverOptions === 'number') {
            url = new URL(`http://${url}:${serverOptions}/`);
            serverOptions = undefined;
        } else if (!(url instanceof URL) || serverOptions !== undefined && typeof serverOptions !== 'object') {
            throw new TypeError('Invalid arguments');
        }

        const defaultService = webService && url.pathname === '/' ? webService : new WebService<any>(null);
        const defaultHandler = defaultService.requestEventHandler();

        super(url, serverOptions ?? {}, (req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse) => {
            if (!this._mountPathPattern) {
                const services = [ ...this._services, this.defaultService ];
                this._mountPathPattern = RegExp(`^(?:${services.map((s) => `(${escapeRegExp(s.webServiceMountPoint)})`).join('|')})`);
                this._requestHandlers  = services.map((s) => s.requestEventHandler());
            }

            const match = this._mountPathPattern.exec(req.url ?? '/');

            for (let i = 1; match && i < match.length; ++i) {
                if (match[i]) {
                    return this._requestHandlers[i - 1](req, res);
                }
            }

            return defaultHandler(req, res);
        });

        this.defaultService = defaultService['_mount']('/', this);

        if (webService && webService !== defaultService) {
            this.mount(url.pathname, webService)
        }
    }

    /**
     * Mounts/adds a secondary {@link WebService} at a specific path.
     *
     * By default, all requests are routed to the default {@link WebService} which was provided when the
     * {@link constructor} was invoced, but it's possible to mount additional {@link WebService} instances as well,
     * forming a multi-application server. In this case, the default {@link WebService} could be used for only a
     * landing/front page and global fallback handlers for missing pages.
     *
     * @param mountPoint The path prefix where the service should be available. Must both begin and end with a forward
     *                   slash.
     * @param service    The {@link WebService} to mount.
     */
    mount(mountPoint: string, service: WebService<any>): this {
        this._services.push(service['_mount'](mountPoint, this));
        this._mountPathPattern = undefined;

        return this;
    }

    /**
     * Unmounts/removes a secondary {@link WebService}.
     *
     * @param serviceOrMountPoint Either a {@link WebService} instance or a mount point.
     */
    unmount(serviceOrMountPoint: WebService<any> | string): this {
        const service = typeof serviceOrMountPoint === 'string'
            ? this._services.find((s) => s.webServiceMountPoint === serviceOrMountPoint)
            : serviceOrMountPoint;

        service?.['_unmount'](this);
        this._services = this._services.filter((s) => s !== service);
        this._mountPathPattern = undefined;

        return this;
    }

    /**
     * Creates a {@link WebServerProxy} that shares the same {@link WebService} instances as this one, but listens
     * on a different port, possibly using a different protocol as well.
     *
     * @param url           The URL to listen on.
     * @param serverOptions Additional server options.
     * @returns             A new {@link WebServerProxy} instance.
     */
    createProxy(url: URL, serverOptions?: ServerOptions): WebServerProxy {
        return new WebServerProxy(this, url, serverOptions);
    }

    /**
     * Stops the WebServer and returns when the server is fully stopped.
     *
     * All associated {@link WebServerProxy} instances are also stopped.
     *
     * @returns This WebServer.
     */
    override stop(): Promise<this> {
        this._proxies.forEach((p) => p.stop().catch((err) => console.error(err)));
        return super.stop();
    }
}

/**
 * A proxy for a main {@link WebServer} that listens on a different port, possibly using a different protocol as well.
 */
export class WebServerProxy extends WebServerBase {
    /**
     * Configures a new port/protocol for the main {@link WebServer} to listen on.
     *
     * @param webServer     The main {@link WebServer} instance to proxy.
     * @param url           The URL to listen on.
     * @param serverOptions Additional server options.
     */
    constructor(public readonly webServer: WebServer, url: URL, serverOptions?: ServerOptions) {
        if (url.pathname !== webServer.url.pathname) {
            throw new TypeError(`Expected pathname in URL '${url}' to be '${webServer.url.pathname}'`);
        }

        super(url, serverOptions ?? {}, webServer['_requestHandler']);
    }

    /** @inheritdoc */
    override start(startOptions?: StartOptions | undefined): Promise<this> {
        this.webServer['_proxies'].push(this);
        return super.start(startOptions);
    }

    /**
     * Stops the WebServerProxy and returns when the server is fully stopped.
     *
     * @returns This WebServerProxy.
     */
    override stop(): Promise<this> {
        this.webServer['_proxies'] = this.webServer['_proxies'].filter((p) => p !== this);
        return super.stop();
    }
}
