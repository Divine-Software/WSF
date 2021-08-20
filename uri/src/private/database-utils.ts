import { DBConnectionPool } from '../database-driver';
import { DBQuery, DBTransactionParams } from '../protocols/database';
import { SessionSelector } from '../selectors';

export const invalidCharacter = '\uFFFF';

export interface DBSessionSelector extends SessionSelector {
    states: {
        database?: DBConnectionPool;
    }
}

export function isDatabaseTransactionParams(dtp: any): dtp is DBTransactionParams;
export function isDatabaseTransactionParams(dtp?: DBTransactionParams): dtp is DBTransactionParams {
    return !!dtp && typeof dtp === 'object' &&
        (dtp.retries === undefined || typeof dtp.retries === 'number') &&
        (dtp.backoff === undefined || typeof dtp.backoff === 'function') &&
        (dtp.begin   === undefined || dtp.begin instanceof DBQuery);
}

export type DBCallback<T> = () => Promise<T>;

export function isDBCallback<T>(cb: unknown): cb is DBCallback<T> {
    return typeof cb === 'function';
}
