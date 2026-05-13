import { DataTable, DT_METADATA, DTAuthorizer, DTError, DTFilter, DTMetadata, Precondition, SafeURIString, unwrap, Wrap } from '@divine/uri';
import { WebError, WebStatus } from './error';
import { type WebArguments, WebResource, WebResourceBase } from './resource';
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

/**
 * REST adapter that exposes a {@link DataTable} through standard HTTP methods.
 *
 * This base class maps REST operations to {@link DataTable} methods:
 *
 * - List resource (`key === null`):
 *   - `GET` -> `list`
 *   - `POST` -> `append`
 * - Entity resource (`key !== null`):
 *   - `GET` -> `load`
 *   - `PUT` -> `save`
 *   - `PATCH` -> `modify`
 *   - `DELETE` -> `remove`
 *
 * To use this class, provide both {@link dataTable} and {@link key} in your concrete resource.
 *
 * - `dataTable` should point to the table instance backing this endpoint.
 * - `key` should be `null` for collection/list URLs (for example `/users`) and the resolved
 *   record key for entity URLs (for example `/users/42`).
 *
 * @template Context Web service context type.
 * @template K       Record key type.
 * @template E       Input entity type accepted by writes.
 * @template T       Stored/returned record type.
 */
export abstract class RESTResource<Context, K extends string, E extends object, T extends object = E> extends WebResourceBase<Context> implements WebResource {
    /**
     * This member should provide the {@link DataTable} instance exposed by this REST resource, either as a direct
     * reference or a getter.
     */
    protected abstract dataTable: DataTable<K, E, T>;

    /**
     * This member should provide the target record key for the current request, either as a direct reference or a
     * getter.
     *
     * It should be `null` for list/collection URLs and a concrete key value for entity URLs.
     */
    protected abstract key: K | null;

    /**
     * This method should enforce authorization and return the value that may be read/written.
     *
     * `current` is the value currently present in the table (or `null` if absent). It must not be modified.
     *
     * `next` is only provided for write operations and resolves to the value that is about to be written to the table.
     *
     * This method must return the value that should be written (for write operations) or returned (for non-write
     * operations). In practice this means returning `current` when `next` is absent, or `await next()` when present, unless
     * access rules require a different outcome.
     *
     * This method should throw {@link WebError} if access is denied.
     *
     * @template V        Authorized value shape (`T` for entity operations, `T[]` for list operations).
     * @param key         Record key, or `null` for list-level operations.
     * @param current     Current metadata-decorated value visible at this stage, or `null`.
     * @param next        Optional callback producing the value that is about to be persisted.
     * @throws {WebError} If access is denied.
     * @returns           The value allowed by authorization, or `null` to deny visibility.
     */
    protected abstract authorize<V extends T | T[]>(key: K | null, current: Readonly<V & DTMetadata> | null, next?: () => Promise<V | null>): Promise<V | null>;

    /**
     * This method should return the canonical location/URL (absolute or relative) for a record.
     *
     * Return `undefined` when no location is known or applicable for the record. In this case, the `content-location`
     * header will be omitted and, for newly created records, the `location` header will be omitted as well.
     *
     * @param record  Record for which to produce a location.
     * @returns       Absolute or relative location reference for this record, if available.
     */
    protected abstract location(record: T): string | SafeURIString | URL | undefined;

    /**
     * This method should return additional list filtering options for `GET` list operations.
     *
     * Override to enable user-provided or default sort/pagination settings or query filters, for instance by parsing
     * query parameters (preferably from the {@link WebArguments} in `args`).
     *
     * By default, it returns an empty filter, which means that the list operation will be performed without any
     * filtering, sorting, or pagination.
     *
     * @returns Filter options passed to {@link DataTable.list}.
     */
    protected filter(): DTFilter {
        return {};
    }

    /**
     * This method should return the request precondition used by write operations.
     *
     * By default, it just returns the precondition provided by the request, if any.
     *
     * @returns Effective precondition for write operations, or `undefined`.
     */
    protected precondition(): Precondition | undefined {
        return this.args.request.precondition;
    }

    /**
     * This method should load and return the request body for create/replace operations.
     *
     * Override this method to transform, validate and normalize incoming payloads before they are passed to the data
     * table, for example by checking required properties, coercing formats or stripping forbidden fields.
     *
     * This method should throw {@link WebError} if the input body is invalid; `UNPROCESSABLE_ENTITY` or
     * `UNSUPPORTED_MEDIA_TYPE` are usually appropriate status codes for such errors, depending on the nature of the
     * problem.
     *
     * @returns Parsed entity payload for `POST` and `PUT` operations.
     */
    protected async entity(): Promise<E> {
        return await this.args.body();
    }

    /**
     * This method should compute the updated entity used by `PATCH` operations.
     *
     * The default implementation performs a deep object merge where nested objects are merged recursively and
     * non-object fields are replaced. Arrays may be patched by using integer object keys (`{"0": "value"}` to set the
     * first element), and all arrays will be converted to dense arrays by the patching process (the result will never
     * contain sparse arrays).
     *
     * Override this method to customize patch semantics, normalize values, or validate patch operations before
     * persistence.
     *
     * This method should throw {@link WebError} if the patch payload is invalid. `UNPROCESSABLE_ENTITY` or
     * `UNSUPPORTED_MEDIA_TYPE` are usually appropriate status codes for such errors, depending on the nature of the
     * problem.
     *
     * @param current Current entity as loaded from storage. May be modified.
     * @returns       Updated entity that will be persisted.
     */
    protected async transform(current: T): Promise<T> {
        const patch = (o: Record<string | number, unknown>, p: object) => {
            for (const [k, v] of Object.entries(p)) {
                if (v !== null && typeof v === 'object' && !Array.isArray(v) && o[k] !== null && typeof o[k] === 'object') {
                    o[k] = patch(o[k] as typeof o, v);
                } else {
                    o[k] = v;
                }
            }

            return Array.isArray(o) ? Object.values(o) /* No sparse arrays allowed! */ : o;
        }

        return patch(current as Record<string | number, unknown>, await this.args.body()) as T;
    }

    /**
     * Converts a data table result into a web response, setting appropriate status codes and headers.
     *
     * You may override this method to customize how data table results are translated into web responses, for example
     * to set additional headers or to change the response format (like masking sensitive fields or wrapping the result
     * in an envelope object).
     *
     * Be aware that if you do not apply the exact same transformation to the result of all operations all of the time,
     * you *must* also update the `etag` header by appending a `~` character followed by some tag that identifies the
     * transformation. Otherwise, `GET`/`HEAD` requests may use stale data that do not take the transformation into
     * account.
     *
     * @param result Data table result to convert. May be an entity or a list of entities; includes metadata through the
     *               `DT_METADATA` symbol.
     * @returns      Web response containing the entity or list of entities, with appropriate status codes and headers.
     */
    protected toWebResponse<R extends T | T[]>(result: R & DTMetadata | Wrap<null> & DTMetadata): WebResponse<R> {
        const { created, timestamp, totalCount, version } = result[DT_METADATA];
        const body = unwrap(result);

        return new WebResponse(body ? (created ? WebStatus.CREATED : WebStatus.OK) : WebStatus.NO_CONTENT, body, {
            'content-location': created !== undefined ? this.location(body as T) : undefined,
            'etag':             version ?? undefined,
            'last-modified':    timestamp?.toUTCString(),
            'location':         created ? this.location(body as T) : undefined,
            'x-total-count':    totalCount,
        });
    }

    private _authorize: DTAuthorizer<K, any> = (key, current, next) => this.authorize(key, current, next);

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
            return this.toWebResponse(await this.dataTable.list(this._authorize, this.filter()));
        } else if (this.key !== null && this.dataTable.load) {
            return this.toWebResponse(await this.dataTable.load(this._authorize, this.key));
        } else {
            this._rejectUnhandledMethod('GET');
        }
    }

    async POST(): Promise<WebResponse<T>> {
        if (this.key === null && this.dataTable.append) {
            return this.toWebResponse(await this.dataTable.append(this._authorize, await this.entity(), this.precondition()));
        } else {
            this._rejectUnhandledMethod('POST');
        }
    }

    async PUT(): Promise<WebResponse<T>> {
        if (this.key !== null && this.dataTable.save) {
            return this.toWebResponse(await this.dataTable.save(this._authorize, this.key, await this.entity(), this.precondition()));
        } else {
            this._rejectUnhandledMethod('PUT');
        }
    }

    async PATCH(): Promise<WebResponse<T>> {
        if (this.key !== null && this.dataTable.modify) {
            return this.toWebResponse(await this.dataTable.modify(this._authorize, this.key, (current) => this.transform(current), this.precondition()));
        } else {
            this._rejectUnhandledMethod('PATCH');
        }
    }

    async DELETE(): Promise<WebResponse<T | null>> {
        if (this.key !== null && this.dataTable.remove) {
            return this.toWebResponse(await this.dataTable.remove(this._authorize, this.key, this.precondition()));
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
