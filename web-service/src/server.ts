import { escapeRegExp, getOrSetEntry } from '@divine/commons';
import { once } from 'events';
import http, { IncomingMessage, ServerResponse } from 'http';
import http2, { Http2ServerRequest, Http2ServerResponse } from 'http2';
import https from 'https';
import { AddressInfo, Socket } from 'net';
import { TLSSocket } from 'tls';
import { WebService } from './service';
import { CONNECTION_CLOSING, WithConnectionClosing } from './private/utils';

type RequestHandler = (request: IncomingMessage | Http2ServerRequest, response: ServerResponse | Http2ServerResponse) => Promise<void>;

function isSession(channel: Socket | TLSSocket | http2.Http2Session): channel is http2.Http2Session {
    return 'goaway' in channel;
}

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

    /** Timeout for graceful shutdown by stopSignals. Default is to wait forever. */
    stopTimeout?: number;

    /** Set to `true` to automatically wait for {@link WebServer.stop} to be called. Defaults to `false`. */
    waitForStop?: boolean;
}

class WebServerBase {
    private _closing = false;
    private _channels: Map<WithConnectionClosing<Socket | TLSSocket | http2.Http2Session>, [number]> = new Map();

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

    /** `true` when the server is shutting down and waiting for connections to terminate. */
    public get closing(): boolean {
        return this._closing;
    }

    /**
     * @param url The URL this WebServer is listening on.
     */
    constructor(public readonly url: URL, serverOptions: ServerOptions, private readonly _requestHandler: RequestHandler) {
        if (url.protocol !== 'http:' && url.protocol !== 'https:' || url.search || url.hash) {
            throw new TypeError('Invalid listen URL');
        }

        const onChannel = (channel: Socket | TLSSocket | http2.Http2Session, socket?: Socket | TLSSocket) => {
            if (isSession(channel) && !socket) {
                channel.on('connect', onChannel);
            } else {
                this._channels.set(channel.once('close', () => this._channels.delete(channel)), [ 0 ]);

                if (isSession(channel) && socket) {
                    this._channels.delete(socket);
                } else if ('_parent' in channel && channel._parent instanceof Socket) {
                    this._channels.delete(channel._parent);
                }
            }
        }

        const onRequest = (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => {
            const channel = 'stream' in res ? res.stream.session : req.socket;
            const counter = getOrSetEntry(this._channels, channel, [ 0 ]);

            if (this._closing) {
                isSession(channel) ? channel.goaway() : res.setHeader('connection', 'close');
            }

            ++counter[0];
            _requestHandler(req, res).finally(() => {
                if (--counter[0] === 0 && this._closing) {
                    isSession(channel) ? channel.close() : channel.end();
                }
            });
        };

        this.server = serverOptions?.version === 2
            ? url.protocol === 'http:'
                ? http2.createServer(serverOptions, onRequest).on('connection', onChannel).on('session', onChannel)
                : http2.createSecureServer(serverOptions, onRequest).on('connection', onChannel).on('secureConnection', onChannel).on('session', onChannel)
            : url.protocol === 'http:'
                ? http.createServer(serverOptions, onRequest).on('connection', onChannel)
                : https.createServer(serverOptions, onRequest).on('connection', onChannel).on('secureConnection', onChannel);
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
            stopTimeout: Number.MAX_VALUE,
            waitForStop: false,

            ...startOptions
        };

        const signals: NodeJS.Signals[] =
            options.stopSignals === false ? [] :
            options.stopSignals === true  ? [ 'SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK' ] :
            options.stopSignals;

        const handler = (_signal: NodeJS.Signals) => {
            signals.forEach((s) => process.off(s, handler));
            this.stop(options.stopTimeout).catch((err) => console.error(err));
        };

        signals.forEach((s) => process.once(s, handler));

        await once(this.server.listen(this.port, this.host), 'listening');

        return options.waitForStop ? this.wait() : this;
    }

    /**
     * Stops the WebServer and returns when the server is fully stopped.
     *
     * If a stop call is already in progress, this method will wait for that stop call to complete (ignoring the
     * timeout).
     *
     * @param timeout The maximum number of milliseconds to wait for open connections to close, before they are forcibly
     *                closed. Default is to wait forever.
     * @returns This WebServer.
     */
    async stop(timeout = Number.MAX_VALUE): Promise<this> {
        if (this.addressInfo !== null && !this._closing) {
            let closeTimer: NodeJS.Timeout | undefined = undefined;

            this._closing = true;

            await new Promise<void>((resolve, reject) => {
                // Stop accepting new connections
                this.server.close((err) => err ? reject(err) : resolve());

                // Gracefully shut down existing connections
                this._channels.forEach((counter, channel) => {
                    channel[CONNECTION_CLOSING] = true;

                    if (isSession(channel)) {
                        channel.close();
                    } else if (counter[0] === 0) {
                        channel.end();
                    }
                });

                closeTimer = timeout < 0x80000000 ? setTimeout(() => {
                    this._channels.forEach((_counter, channel) => {
                        isSession(channel) ? channel.close() : channel.end(); // Ask nicely ...
                        channel.destroy();                                    // ... just kidding.
                    });
                    resolve();
                }, timeout) : undefined;
            }).finally(() => {
                this._closing = false;
                clearTimeout(closeTimer);
            });
        } else if (this._closing) {
            await this.wait();
        }

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
        if (this.addressInfo !== null || this._closing) {
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

    private _services: WebService<any>[] = [];
    private _mountPathPattern?: RegExp;
    private _requestHandlers!: RequestHandler[];

    /**
     * Creates a new WebServer instance, optionally mounting a default {@link WebService} at the root path.
     *
     * @param host           The host name or IP address to listen on.
     * @param port           The port number to listen on.
     * @param defaultService The default {@link WebService} to mount at the root path. If not provided, a default
     *                       service will be created and mounted (accessible via the {@link defaultService} property).
     */
    constructor(host: string, port: number, defaultService?: WebService<any>);
    /**
     * Creates a new WebServer instance, optionally mounting a {@link WebService} at the path specified by the listen
     * URL.
     *
     * @param url            The HTTP/HTTPS URL to listen on, specified by the URL's `hostname` and `port`. The
     *                       `protocol` determines if the server will use TCP or TLS.
     * @param serverOptions  Additional server options for the underlying Node.js HTTP/HTTPS/HTTP2 server. Set `version`
     *                       to `2` to create an HTTP2 server.
     * @param webService     An optional web service to mount at the path specified by the listen URL's `pathname`. If
     *                       the path is not `/`, or if no service is specified, a default service will be created and
     *                       mounted at the root path (accessible via the {@link defaultService} property).
     */
    constructor(url: URL, serverOptions?: ServerOptions , webService?: WebService<any>);
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
}
