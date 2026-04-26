import { recordify } from '@divine/commons';
import YAML from 'yaml';
import { Parser, StringParser } from '../parsers';
import { BasicTypes, FIELDS, WithFields, wrap } from '../uri-types';

/**
 * The `application/yaml`, `application/x-yaml`, `text/vnd.yaml`, `text/x-yaml` and `text/yaml` parser handles
 * [YAML](https://yaml.org/) using [yaml](https://eemeli.org/yaml/) and {@link StringParser}.
 *
 * Only the first document in a multi-document YAML file is returned when parsing. To access all documents, use the
 * {@link FIELDS} property.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. Plain `number`
 * values will be serialized with a `.0` suffix to ensure they are parsed as `bigint` on the receiving end.
 *
 */
export class YAMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<object & WithFields<BasicTypes>> {
        const yaml = YAML.parseAllDocuments(await new StringParser(this.contentType).parse(stream), { intAsBigInt: true });
        const json = yaml.map((yaml) => yaml.toJS({ mapAsMap: false, reviver: (_, value) =>  recordify(value) }) as BasicTypes);
        const data = wrap(json[0]);

        return json.length === 1 ? data : Object.defineProperty(data, FIELDS, { value: json });
    }

    serialize(data: BasicTypes): Buffer;
    serialize(data: BasicTypes & WithFields<BasicTypes>): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            const stringify = (value: unknown) => {
                const doc = new YAML.Document(value);

                YAML.visit(doc, (key, node) => {
                    if (key === 'value' && node instanceof YAML.Scalar && typeof node.value === 'number' && /^[-+0-9]+$/.test(JSON.stringify(node.value))) {
                        node.minFractionDigits ??= 1;
                    }
                });

                return doc.toString();
            };

            const entries = data?.[FIELDS] ?? [data];
            const strings = entries.map((entry) => stringify(entry));

            return new StringParser(this.contentType).serialize(strings.join('---\n'));
        }
        catch (ex) {
            this._assertSerializebleData(false, data, ex);
        }
    }
}

Parser
    .register('application/x-yaml', YAMLParser)
    .register('application/yaml', YAMLParser)
    .register('text/vnd.yaml', YAMLParser)
    .register('text/x-yaml', YAMLParser)
    .register('text/yaml', YAMLParser)
;
