import { isAsyncIterable } from '@divine/commons';
import { Parser } from '../parsers';

/** Represents a `text/event-stream` (SSE/server-sent events) event. */
export interface EventStreamEvent {
    /** The event name. */
    event?: string;

    /** The event data, as a string. */
    data:   string;

    /** The event ID, to update the client's *last event ID* value. */
    id?:    string;

    /** The client reconnection time, in milliseconds. */
    retry?: number;
}

/**
 * Checks whether the passed argument is an {@link EventStreamEvent}.
 *
 * @param event The object to check
 * @returns     `true` if `event` is an EventStreamEvent.
 */
export function isEventStreamEvent(event: any): event is EventStreamEvent {
    return typeof event === 'object' && typeof event.data  === 'string' &&
        (event.event === undefined || typeof event.event === 'string') &&
        (event.id    === undefined || typeof event.id    === 'string') &&
        (event.retry === undefined || typeof event.retry === 'number');
}

/**
 * The `text/event-stream` parser reads and writes [SSE/server-sent
 * events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/) streams, translating between
 * `AsyncIterable<Buffer>` and `AsyncIterable<`{@link EventStreamEvent}`>`.
 */
export class EventStreamParser extends Parser {
    // See <https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation>
    static async *parser(stream: AsyncIterable<Buffer>): AsyncIterable<EventStreamEvent> {
        let extra = '';
        let event: EventStreamEvent = { data: '' };

        for await (const chunk of stream) {
            const lines = (extra + chunk.toString('binary')).split(/\n/);
            extra = lines.pop() ?? '';

            for (const line of lines.map((line) => Buffer.from(line, 'binary').toString('utf8'))) {
                if (line === '') {
                    if (event.data !== '') {
                        event.data = event.data.endsWith('\n') ? event.data.substr(0, event.data.length - 1) : event.data;
                        yield event;
                    }

                    event = { data: '' };
                }
                else if (line[0] !== ':') {
                    const [, field, value] = /([^:]+): ?(.*)/.exec(line) ?? ['', line, ''];

                    if (field === 'event') {
                        event.event = value;
                    }
                    else if (field === 'data') {
                        event.data += value + '\n';
                    }
                    else if (field === 'id') {
                        event.id = value;
                    }
                    else if (field === 'retry' && /^[0-9]+$/.test(value)) {
                        event.retry = Number(value);
                    }
                }
            }
        }
    }

    async parse(stream: AsyncIterable<Buffer>): Promise<AsyncIterable<EventStreamEvent>> {
        return EventStreamParser.parser(stream);
    }

    async *serialize(data: AsyncIterable<EventStreamEvent | undefined | null>): AsyncIterable<Buffer> {
        this._assertSerializebleData(isAsyncIterable(data), data);

        for await (const event of data) {
            if (!event) {
                yield Buffer.from(':\n\n');
            }
            else {
                this._assertSerializebleData(isEventStreamEvent(event), event);

                yield Buffer.from(
                    (event.event !== undefined ? `event: ${event.event}\n` : '') +
                    (event.id    !== undefined ? `id: ${event.id}\n`       : '') +
                    (event.retry !== undefined ? `retry: ${event.retry}\n` : '') +
                    event.data.split(/\n/).map((line) => `data: ${line}`).join('\n') + '\n\n',
                    'utf8'
                );
            }
        }
    }
}

Parser.register('text/event-stream', EventStreamParser);
