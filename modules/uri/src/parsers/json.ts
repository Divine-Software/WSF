import { recordify } from '@divine/commons';
import { Parser, StringParser } from '../parsers';
import { BasicTypes } from '../uri-types';

/**
 * Utility function to parse JSON with standard WSF behavior.
 *
 * Unlike the built-in JSON parser/serializer, all parsed objects will have a `null` prototype and all integer numbers
 * will be parsed as `bigint`. Plain `number` values will be serialized with a `.0` suffix to ensure they are parsed as
 * `bigint` on the receiving end.
 *
 * @param text A valid JSON string.
 * @returns    A parsed JSON value.
 */
export function parseJSON(text: string): BasicTypes {
    return JSON.parse(text, (key: string, value: undefined, context?: { source: string }) => {
        if (typeof value === 'number' && context?.source && /^[-+0-9]+$/.test(context.source)) {
            return BigInt(context.source);
        } else {
            return recordify(value);
        }
    });
}

/**
 * Utility function to serialize JSON with standard WSF behavior.
 *
 * Unlike the built-in JSON parser/serializer, all parsed objects will have a `null` prototype and all integer numbers
 * will be parsed as `bigint`. Plain `number` values will be serialized with a `.0` suffix to ensure they are parsed as
 * `bigint` on the receiving end.
 *
 * @param value The value to serialize.
 * @returns     A JSON string.
 */
export function serializeJSON(value: unknown): string {
    return JSON.stringify(value, (_, value) => {
        if (typeof value === 'bigint') {
            return (JSON as any).rawJSON(value.toString());
        } else if (typeof value === 'number') {
            const serialized = JSON.stringify(value);
            return (JSON as any).rawJSON(/^[-+0-9]+$/.test(serialized) ? `${serialized}.0` : serialized);
        } else {
            return value;
        }
    });
}

/**
 * The `application/json` and `application/*+json` parser handles [JSON](https://www.json.org) using {@link JSON.parse},
 * {@link JSON.stringify} (with a custom reviver/replacer) and {@link StringParser}.
 *
 * Unlike the built-in JSON parser/serializer, all parsed objects will have a `null` prototype and all integer numbers
 * will be parsed as `bigint`. Plain `number` values will be serialized with a `.0` suffix to ensure they are parsed as
 * `bigint` on the receiving end.
 */
export class JSONParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<BasicTypes> {
        return parseJSON(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            data = serializeJSON(data);
        } catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser
    .register('application/json',        JSONParser)
    .register(/^application\/.*\+json$/, JSONParser)
;
