import TOML from '@iarna/toml';
import { Parser, StringParser } from '../parsers';

/**
 * The `application/toml` parser handles [TOML](https://toml.io) using
 * [@iarna/toml](https://www.npmjs.com/package/@iarna/toml) and [[StringParser]].
 */
export class TOMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<TOML.JsonMap> {
        return TOML.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(data !== null && data !== undefined && !(data instanceof Date), data);

        try {
            if (typeof data === 'object' && !Array.isArray(data)) {
                data = TOML.stringify(data as TOML.JsonMap);
            }
            else {
                data = TOML.stringify.value(data as TOML.AnyJson);
            }
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser.register('application/toml', TOMLParser);
