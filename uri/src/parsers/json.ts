import type { BasicTypes } from '@divine/commons';
import { Parser, StringParser } from '../parsers';

/**
 * The `application/json` and `application/*+json` parser handles [JSON](https://www.json.org) using {@link JSON.parse},
 * {@link JSON.stringify} and {@link StringParser}.
 */
export class JSONParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<BasicTypes> {
        return JSON.parse(await new StringParser(this.contentType).parse(stream));
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            data = JSON.stringify(data);
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }

        return new StringParser(this.contentType).serialize(data);
    }
}

Parser
    .register('application/json',        JSONParser)
    .register(/^application\/.*\+json$/, JSONParser)
;
