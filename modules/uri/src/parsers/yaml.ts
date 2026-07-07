import { recordify } from '@divine/commons';
import YAML from 'yaml';
import { Parser, StringParser } from '../parsers';
import { BasicTypes, FIELDS, WithFields, wrap, Wrap } from '../uri-types';

/**
 * Utility function to parse YAML with standard WSF behavior.
 *
 * All parsed objects will have a `null` prototype. By default, all integer numbers will be parsed as `bigint` and
 * `number` integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 *
 * Only the first document in a multi-document YAML file is returned when parsing. To access all documents, use
 * {@link Parser.parse} or {@link YAMLParser} directly, which both return all documents in the `FIELDS` property of the
 * returned object.
 *
 * @param text      A valid YAML string.
 * @param integers  Whether to treat integers distinct from decimal numbers or not. Default is {@link Parser.integers}.
 * @returns         A parsed YAML value.
 */
export function parseYAML<T extends BasicTypes>(text: string, integers = Parser.integers): T {
    return YAML.parseDocument(text, { intAsBigInt: integers }).toJS({ mapAsMap: false, reviver: (_, value) =>  recordify(value) }) as T;
}

/**
 * Utility function to serialize YAML with standard WSF behavior.
 *
 * Only the first document in a multi-document YAML file is returned when parsing. To access all documents, use the
 * {@link FIELDS} property.
 *
 * All parsed objects will have a `null` prototype. By default, all integer numbers will be parsed as `bigint` and
 * `number` integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 *
 * @param value     The value to serialize.
 * @param integers  Whether to treat integers distinct from decimal numbers or not. Default is {@link Parser.integers}.
 * @returns         A YAML string.
 */
export function serializeYAML(value: BasicTypes & WithFields<BasicTypes>, integers = Parser.integers): string {
    const stringify = (value: unknown) => {
        const doc = new YAML.Document(value);

        integers && YAML.visit(doc, (key, node) => {
            if (key === 'value' && node instanceof YAML.Scalar && typeof node.value === 'number' && /^[-+0-9]+$/.test(JSON.stringify(node.value))) {
                node.minFractionDigits ??= 1;
            }
        });

        return doc.toString();
    };

    const entries = value?.[FIELDS] ?? [value];
    const strings = entries.map((entry) => stringify(entry));

    return strings.join('---\n');
}

/**
 * The `application/yaml`, `application/x-yaml`, `text/vnd.yaml`, `text/x-yaml` and `text/yaml` parser handles
 * [YAML](https://yaml.org/) using [yaml](https://eemeli.org/yaml/) and {@link StringParser}.
 *
 * Only the first document in a multi-document YAML file is returned when parsing. To access all documents, use the
 * {@link FIELDS} property.
 *
 * All parsed objects will have a `null` prototype and all integer numbers will be parsed as `bigint`. All `number`
 * integers will be serialized with a `.0` suffix to ensure they are parsed as `number` and not `bigint` on the
 * receiving end.
 *
 */
export class YAMLParser extends Parser {
    async parse<T extends BasicTypes>(stream: AsyncIterable<Buffer>): Promise<Wrap<T> & WithFields<BasicTypes>> {
        const yaml = YAML.parseAllDocuments(await new StringParser(this.contentType).parse(stream), { intAsBigInt: this.integers });
        const json = yaml.map((yaml) => yaml.toJS({ mapAsMap: false, reviver: (_, value) =>  recordify(value) }) as T);
        const data = wrap(json[0]);

        return (json.length === 1 ? data : Object.defineProperty(data, FIELDS, { value: json })) as Wrap<T> & WithFields<BasicTypes>;
    }

    serialize(data: BasicTypes): Buffer;
    serialize(data: BasicTypes & WithFields<BasicTypes>): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            return new StringParser(this.contentType).serialize(serializeYAML(data, this.integers));
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
