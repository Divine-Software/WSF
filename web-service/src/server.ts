import { escapeRegExp } from '@divine/commons';
import { once } from 'events';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { WebService } from './service';

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

/**
 * A web server that listens for incoming HTTP requests on a specific port and delegates requests to one or more
 * {@link WebService} instances.
 */
export class WebServer {
    /** The underlying Node.js [Server](https://nodejs.org/api/http.html#class-httpserver) instance. */
    public readonly server: Server;

    private _services: Array<WebService<any>> = [];
    private _mountPathPattern?: RegExp;
    private _requestHandlers!: Array<(req: IncomingMessage, res: ServerResponse) => void>;

    constructor(public readonly host: string, public readonly port: number, defaultService: WebService<any>) {
        const defaultRequestHandler = defaultService['_mount']('/').requestEventHandler();

        this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
            if (!this._mountPathPattern) {
                const services = [ ...this._services, defaultService ];
                this._mountPathPattern = RegExp(`^(?:${services.map((s) => `(${escapeRegExp(s.webServiceMountPoint)})`).join('|')})`);
                this._requestHandlers  = services.map((s) => s.requestEventHandler());
            }

            const match = this._mountPathPattern.exec(req.url ?? '/');

            for (let i = 1; match && i < match.length; ++i) {
                if (match[i]) {
                    return this._requestHandlers[i - 1](req, res);
                }
            }

            return defaultRequestHandler(req, res);
        });
    }

    /**
     * Mounts/adds a secondary {@link WebService} at a specific path.
     *
     * By default, all requests are routed to the default {@link WebService} which was provided when the
     * {@link constructor} was invoced, but it's possible to mount additional {@link WebService} instances as well,
     * forming a multi-application server. In this case, the default {@link WebService} could be used for only a
     * landing/front page and global error handlers for missing pages.
     *
     * @param mountPoint The path prefix where the service should be available. Must both begin and end with a forward
     *                   slash.
     * @param service    The {@link WebService} to mount.
     */
    mount(mountPoint: string, service: WebService<any>): this {
        this._services.push(service['_mount'](mountPoint));
        this._mountPathPattern = undefined;

        return this;
    }

    /**
     * Unmounts/removes a secondary {@link WebService}.
     *
     * @param serviceOrMountPoint Either a {@link WebService}.
     */
    unmount(serviceOrMountPoint: WebService<any> | string): this {
        const service = typeof serviceOrMountPoint === 'string'
            ? this._services.find((s) => s.webServiceMountPoint === serviceOrMountPoint)
            : serviceOrMountPoint;

        service?.['_unmount']();
        this._services = this._services.filter((s) => s !== service);
        this._mountPathPattern = undefined;

        return this;
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

    /**
     * Stops the WebServer and returns when the server is fully stopped.
     *
     * @returns This WebServer.
     */
    async stop(): Promise<this> {
        await new Promise((resolve, reject) => {
            this.server.close((err) => err ? reject(err) : resolve(this));
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

    /** Information about the actual listening port, as provided by the Node.js [Server](https://nodejs.org/api/http.html#class-httpserver). */
    get addressInfo(): AddressInfo {
        return this.server.address() as AddressInfo;
    }
}
