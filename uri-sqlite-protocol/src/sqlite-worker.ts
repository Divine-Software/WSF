import Database from 'better-sqlite3';
import { parentPort } from 'worker_threads';

export interface ErrorResult {
    type:    'error';
    message: string;
    code?:   string;
}

export interface OpenDatabaseMessage {
    type:   'open';
    dbPath: string;
    params: Omit<Database.Options, 'verbose'>;
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
    columns?:          Database.ColumnDefinition[]
    rows?:             unknown[][];
    changes?:          number;
    lastInsertRowid?:  string;
}

export type SQLiteWorkerMessage = OpenDatabaseMessage | CloseDatabaseMessage | ExecuteQueryMessage | ShutdownMessage;
export type SQLiteWorkerResult  = OpenDatabaseResult  | CloseDatabaseResult  | ExecuteQueryResult  | ShutdownResult  | ErrorResult;

let database: Database.Database | null = null;

function sendResult(result: SQLiteWorkerResult) {
    parentPort?.postMessage(result);
}

parentPort?.on('message', (message: SQLiteWorkerMessage) => {
    try {
        if (message.type === 'open') {
            if (database) {
                throw new Error(`Database '${database.name}' already open`);
            }

            database = new Database(message.dbPath, message.params)
                .defaultSafeIntegers(true);

            sendResult({ type: message.type })
        }
        else if (message.type === 'close') {
            if (!database) {
                throw new Error(`No database open`);
            }

            database.close();
            database = null;

            sendResult({ type: message.type })
        }
        else if (message.type === 'execute') {
            if (!database) {
                throw new Error(`No database open`);
            }

            const query = database.prepare(message.query);

            if (query.reader) {
                const reader  = query.raw(true);
                const rows    = reader.all(...message.params) as unknown[][];
                const columns = reader.columns();

                sendResult({ type: message.type, columns, rows });
            }
            else {
                const info = query.run(...message.params);

                sendResult({ type: message.type, changes: info.changes, lastInsertRowid: info.lastInsertRowid?.toString() });
            }
        }
        else if (message.type === 'shutdown') {
            sendResult({ type: message.type })
            parentPort?.close();
            database?.close();
        }
        else {
            throw new Error(`Invalid action '${message['type']}'`);
        }
    }
    catch (err: any) {
        // console.error(`*** SQLiteWorker message exception`, err, message);
        sendResult({ type: 'error', message: err?.message ?? String(err), code: err.code });
    }
}).on('close', () => {
    database?.close();
    parentPort?.close();
}).on('messageerror', (_error) => {
    parentPort?.close();
});
