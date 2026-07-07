import { isJSON, recordify } from '@divine/commons';
import TOML from 'smol-toml';
import { Parser, StringParser } from '../parsers';

/**
 * Utility function to parse TOML with standard WSF behavior.
 *
 * All parsed objects will have a `null` prototype. By default, all integer numbers will be parsed as `bigint` and
 * `number` integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 *
 * @param text      A valid TOML string.
 * @param integers  Whether to treat integers distinct from decimal numbers or not. Default is {@link Parser.integers}.
 * @returns         A parsed TOML table.
 */
export function parseTOML<T extends object>(text: string, integers = Parser.integers): T {
    return recordify(TOML.parse(text, { integersAsBigInt: integers })) as T;
}

/**
 * Utility function to serialize TOML with standard WSF behavior.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. All `number`
 * integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 *
 * @param value     The value to serialize.
 * @param integers  Whether to treat integers distinct from decimal numbers or not. Default is {@link Parser.integers}.
 * @returns         A TOML string.
 */
export function serializeTOML(value: object, integers = Parser.integers): string {
    return TOML.stringify(value, { numbersAsFloat: integers });
}

/**
 * The `application/toml` parser handles [TOML](https://toml.io) using
 * [smol-toml](https://www.npmjs.com/package/smol-toml) and {@link StringParser}.
 *
 * All parsed objects will have a `null` prototype. By default, all integer numbers will be parsed as `bigint` and
 * `number` integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 */
export class TOMLParser extends Parser {
    async parse<T extends object>(stream: AsyncIterable<Buffer>): Promise<T> {
        return parseTOML(await new StringParser(this.contentType).parse(stream), this.integers);
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(isJSON(data) && !Array.isArray(data), data);

        try {
            data = serializeTOML(data, this.integers);
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/toml', TOMLParser);
