import { isJSON, recordify } from '@divine/commons';
import TOML, { TomlTable } from 'smol-toml';
import { Parser, StringParser } from '../parsers';

/**
 * The `application/toml` parser handles [TOML](https://toml.io) using
 * [smol-toml](https://www.npmjs.com/package/smol-toml) and {@link StringParser}.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. Plain `number`
 * values will be serialized with a `.0` suffix to ensure they are parsed as `bigint` on the receiving end.
 */
export class TOMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<TomlTable> {
        return recordify(TOML.parse(await new StringParser(this.contentType).parse(stream), { integersAsBigInt: true }));
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(isJSON(data) && !Array.isArray(data), data);

        try {
            data = TOML.stringify(data, { numbersAsFloat: true });
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/toml', TOMLParser);
