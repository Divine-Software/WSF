import { recordify, type BasicTypes } from '@divine/commons';
import { Parser, StringParser } from '../parsers';

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
        return JSON.parse(await new StringParser(this.contentType).parse(stream), (key: string, value: undefined, context?: { source: string }) => {
            if (typeof value === 'number' && context?.source && /^[-+0-9]+$/.test(context.source)) {
                return BigInt(context.source);
            } else {
                return recordify(value);
            }
        });
    }

    serialize(data: unknown): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            data = JSON.stringify(data, (_, value) => {
                if (typeof value === 'bigint') {
                    return (JSON as any).rawJSON(value.toString());
                } else if (typeof value === 'number') {
                    const serialized = JSON.stringify(value);
                    return (JSON as any).rawJSON(/^[-+0-9]+$/.test(serialized) ? `${serialized}.0` : serialized);
                } else {
                    return value;
                }
            });
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
