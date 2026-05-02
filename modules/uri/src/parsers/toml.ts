import { isJSON, recordify } from '@divine/commons';
import TOML from 'smol-toml';
import { Parser, StringParser } from '../parsers';

/**
 * Utility function to parse TOML with standard WSF behavior.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. Plain `number`
 * values will be serialized with a `.0` suffix to ensure they are parsed as `bigint` on the receiving end.
 *
 * @param text A valid TOML string.
 * @returns    A parsed TOML table.
 */
export function parseTOML<T extends object>(text: string): T {
    return recordify(TOML.parse(text, { integersAsBigInt: true })) as T;
}

/**
 * Utility function to serialize TOML with standard WSF behavior.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. Plain `number`
 * values will be serialized with a `.0` suffix to ensure they are parsed as `bigint` on the receiving end.
 *
 * @param value The value to serialize.
 * @returns     A TOML string.
 */
export function serializeTOML(value: object): string {
    return TOML.stringify(value, { numbersAsFloat: true });
}

/**
 * The `application/toml` parser handles [TOML](https://toml.io) using
 * [smol-toml](https://www.npmjs.com/package/smol-toml) and {@link StringParser}.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. Plain `number`
 * values will be serialized with a `.0` suffix to ensure they are parsed as `bigint` on the receiving end.
 */
export class TOMLParser extends Parser {
    async parse<T extends object>(stream: AsyncIterable<Buffer>): Promise<T> {
        return parseTOML(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(isJSON(data) && !Array.isArray(data), data);

        try {
            data = serializeTOML(data);
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/toml', TOMLParser);
