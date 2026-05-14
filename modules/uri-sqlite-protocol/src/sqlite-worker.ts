import { DatabaseSync, type StatementColumnMetadata, type SQLInputValue } from 'node:sqlite';
import { parentPort } from 'worker_threads';
import type { SQLiteConnectOptions } from './sqlite-protocol';

export interface ErrorResult {
    type:    'error';
    message: string;
    code?:   number;
}

export interface OpenDatabaseMessage {
    type:   'open';
    dbPath: string;
    params: SQLiteConnectOptions;
}

export interface OpenDatabaseResult {
    type:   'open';
}

export interface CloseDatabaseMessage {
    type:   'close';
}

export interface CloseDatabaseResult {
    type:   'close';
}

export interface ShutdownMessage {
    type:   'shutdown';
}

export interface ShutdownResult {
    type:   'shutdown';
}

export interface ExecuteQueryMessage {
    type:   'execute';
    query:  string;
    params: readonly unknown[];
}

export interface ExecuteQueryResult {
    type:              'execute';
    columns?:          StatementColumnMetadata[]
    rows?:             unknown[][];
    changes?:          number;
    lastInsertRowid?:  string;
}

export type SQLiteWorkerMessage = OpenDatabaseMessage | CloseDatabaseMessage | ExecuteQueryMessage | ShutdownMessage;
export type SQLiteWorkerResult  = OpenDatabaseResult  | CloseDatabaseResult  | ExecuteQueryResult  | ShutdownResult  | ErrorResult;

let database: DatabaseSync | null = null;

function sendResult(result: SQLiteWorkerResult) {
    parentPort?.postMessage(result);
}

parentPort?.on('message', (message: SQLiteWorkerMessage) => {
    try {
        if (message.type === 'open') {
            if (database) {
                throw new Error(`Database '${message.dbPath}' already open.`);
            }

            database = new DatabaseSync(message.dbPath, {
                ...{ ...message.params, extensions: undefined, functions: undefined },
                allowBareNamedParameters:    false,
                allowExtension:              !!message.params.extensions?.length,
                allowUnknownNamedParameters: false,
                open:                        true,
                readBigInts:                 message.params.readBigInts ?? true, // Default is true.
                returnArrays:                true,
                timeout:                     message.params.timeout ?? 5000,     // Default is 5000 ms.
            });

            for (const ext of message.params.extensions ?? []) {
                database.loadExtension(ext);
            }

            for (const [name, options] of Object.entries(message.params.aggregates ?? {})) {
                database.aggregate(name, {
                    ...options,
                    useBigIntArguments: options.useBigIntArguments ?? message.params.readBigInts ?? true,
                });
            }

            for (const [name, { options, func }] of Object.entries(message.params.functions ?? {})) {
                database.function(name, {
                    ...options,
                    useBigIntArguments: options?.useBigIntArguments ?? message.params.readBigInts ?? true,
                }, func);
            }

            sendResult({ type: message.type })
        }
        else if (message.type === 'close') {
            if (!database) {
                throw new Error(`No database open.`);
            }

            database.close();
            database = null;

            sendResult({ type: message.type })
        }
        else if (message.type === 'execute') {
            if (!database) {
                throw new Error(`No database open.`);
            }

            const query = database.prepare(message.query);
            const columns = query.columns();

            if (columns.length > 0) {
                const rows = query.all(...message.params as SQLInputValue[]) as unknown as unknown[][];

                sendResult({ type: message.type, columns, rows });
            }
            else {
                const info = query.run(...message.params as SQLInputValue[]);

                sendResult({ type: message.type, changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid?.toString() });
            }
        }
        else if (message.type === 'shutdown') {
            sendResult({ type: message.type })
            parentPort?.close();
            database?.close();
        }
        else {
            throw new Error(`Invalid action '${message['type']}'.`);
        }
    }
    catch (err: any) {
        // console.error(`*** SQLiteWorker message exception`, err, message);
        sendResult({ type: 'error', message: err?.message ?? String(err), code: err.code === 'ERR_SQLITE_ERROR' ? err.errcode : undefined });
    }
}).on('close', () => {
    database?.close();
    parentPort?.close();
}).on('messageerror', (_error) => {
    parentPort?.close();
});
