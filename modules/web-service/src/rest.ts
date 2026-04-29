import { DataTable, DT_METADATA, DTAuthorizer, Precondition, DTError, DTFilter, DTMetadata, unwrap, Wrap } from '@divine/uri';
import { WebError, WebStatus } from './error';
import { WebResource, WebResourceBase } from './resource';
import { WebResponse } from './response';
import { WebService } from './service';

const LIST_METHOD_MAP = {
    'list':    'GET',
    'append':  'POST',
};

const ENTITY_METHOD_MAP = {
    'load':    'GET',
    'save':    'PUT',
    'modify':  'PATCH',
    'remove':  'DELETE',
};

export abstract class RESTResource<Context, K extends string, E extends object, T extends object = E> extends WebResourceBase<Context> implements WebResource {
    protected abstract dataTable: DataTable<K, E, T>;
    protected abstract key: K | null;

    protected abstract authorize<V extends T | T[]>(key: K | null, current: V & DTMetadata | null, next?: () => Promise<V | null>): Promise<V | null>;
    protected abstract location(record: T): string | URL;

    protected filter(): DTFilter {
        return {};
    }

    protected precondition(): Precondition | undefined {
        return this.args.request.precondition;
    }

    protected async entity(): Promise<E> {
        return await this.args.body();
    }

    protected async transform(current: T): Promise<T> {
        return Object.assign(current, await this.args.body());
    }

    private _authorize: DTAuthorizer<K, any> = (key, current, next) => this.authorize(key, current, next);

    private _toWebResponse<R extends T | T[]>(written: boolean, result: R & DTMetadata | Wrap<null> & DTMetadata): WebResponse<R> {
        const body = unwrap(result);

        return new WebResponse(result[DT_METADATA].created ? WebStatus.CREATED : body ? WebStatus.OK : WebStatus.NO_CONTENT, body, {
            'content-location': written ? this.location(body as T) : undefined,
            'etag':             result[DT_METADATA].version ?? undefined,
            'last-modified':    result[DT_METADATA].timestamp?.toUTCString(),
            'location':         result[DT_METADATA].created ? this.location(body as T) : undefined,
            'x-total-count':    result[DT_METADATA].totalCount,
        });
    }

    private _rejectUnhandledMethod(method: string): never {
        return WebService.rejectUnhandledMethod(method, this.dataTable, this.key === null ? LIST_METHOD_MAP : ENTITY_METHOD_MAP);
    }

    async OPTIONS() {
        const rsrcMetadata = this.key === null && !this.args.has('@access-control-request-method') ? await this.dataTable.info?.() ?? null : null; // !CORS

        return new WebResponse(WebStatus.OK, null, {
            'allow':         WebService.makeAllowHeader(this.dataTable, this.key === null ? LIST_METHOD_MAP : ENTITY_METHOD_MAP),
            'etag':          rsrcMetadata?.[DT_METADATA].version ?? undefined,
            'last-modified': rsrcMetadata?.[DT_METADATA].timestamp?.toUTCString(),
            'x-total-count': rsrcMetadata?.[DT_METADATA].totalCount,
        });
    }

    async GET(): Promise<WebResponse<T | T[]>> {
        if (this.key === null && this.dataTable.list) {
            return this._toWebResponse(false, await this.dataTable.list(this._authorize, this.filter()));
        } else if (this.key !== null && this.dataTable.load) {
            return this._toWebResponse(false, await this.dataTable.load(this._authorize, this.key));
        } else {
            this._rejectUnhandledMethod('GET');
        }
    }

    async POST(): Promise<WebResponse<T>> {
        if (this.key === null && this.dataTable.append) {
            return this._toWebResponse(true, await this.dataTable.append(this._authorize, await this.entity(), this.precondition()));
        } else {
            this._rejectUnhandledMethod('POST');
        }
    }

    async PUT(): Promise<WebResponse<T>> {
        if (this.key !== null && this.dataTable.save) {
            return this._toWebResponse(true, await this.dataTable.save(this._authorize, this.key, await this.entity(), this.precondition()));
        } else {
            this._rejectUnhandledMethod('PUT');
        }
    }

    async PATCH(): Promise<WebResponse<T>> {
        if (this.key !== null && this.dataTable.modify) {
            return this._toWebResponse(true, await this.dataTable.modify(this._authorize, this.key, (current) => this.transform(current), this.precondition()));
        } else {
            this._rejectUnhandledMethod('PATCH');
        }
    }

    async DELETE(): Promise<WebResponse<T | null>> {
        if (this.key !== null && this.dataTable.remove) {
            return this._toWebResponse(false, await this.dataTable.remove(this._authorize, this.key, this.precondition()));
        } else {
            this._rejectUnhandledMethod('DELETE');
        }
    }

    catch(err: Error): never {
        if (err instanceof DTError) {
            switch (err.code) {
                case 'not-found':           throw new WebError(WebStatus.NOT_FOUND,           `Entity '${this.key}' does not exist.`);
                case 'precondition-failed': throw new WebError(WebStatus.PRECONDITION_FAILED, `Precondition '${this.precondition()?.mode}' not met.`);
            }
        }

        throw err;
    }
}
