import { once } from 'events';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { WebService } from './service';
import { escapeRegExp } from './private/utils';

export interface StartOptions {
    stopSignals?: boolean | NodeJS.Signals[];
    waitForStop?: boolean;
}

export class WebServer {
    public readonly server: Server;

    private _services: Array<WebService<any>> = [];
    private _mountPathPattern?: RegExp;
    private _requestHandlers!: Array<(req: IncomingMessage, res: ServerResponse) => void>;

    constructor(public readonly host: string, public readonly port: number, defaultService: WebService<any>) {
        const defaultRequestHandler = defaultService.mount('/').requestEventHandler();

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

    mount(mountPoint: string, service: WebService<any>): this {
        this._services.push(service.mount(mountPoint));
        this._mountPathPattern = undefined;

        return this;
    }

    unmount(serviceOrMountPoint: WebService<any> | string): this {
        const service = typeof serviceOrMountPoint === 'string'
            ? this._services.find((s) => s.webServiceMountPoint === serviceOrMountPoint)
            : serviceOrMountPoint;

        service?.unmount();
        this._services = this._services.filter((s) => s !== service);
        this._mountPathPattern = undefined;

        return this;
    }

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
        await new Promise((resolve, reject) => {
            this.server.close((err) => err ? reject(err) : resolve(this));
        });

        return this;
    }

    async wait(): Promise<this> {
        if (this.server.address() !== null) {
            await once(this.server, 'close');
        }

        return this;
    }

    get addressInfo(): AddressInfo {
        return this.server.address() as AddressInfo;
    }
}
