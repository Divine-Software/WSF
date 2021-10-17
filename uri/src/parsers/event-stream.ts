import { isAsyncIterable } from '@divine/commons';
import { Parser } from '../parsers';

export interface EventStreamEvent {
    event?: string;
    data:   string;
    id?:    string;
    retry?: number;
}

export function isEventStreamEvent(event: any): event is EventStreamEvent {
    return typeof event === 'object' && typeof event.data  === 'string' &&
        (event.event === undefined || typeof event.event === 'string') &&
        (event.id    === undefined || typeof event.id    === 'string') &&
        (event.retry === undefined || typeof event.retry === 'number');
}

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
        this._assertSerializebleData(isAsyncIterable<EventStreamEvent | undefined | null>(data), data);

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
