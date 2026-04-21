import { BasicTypes, RecordReviver } from '@divine/commons';
import YAML from 'yaml';
import { Parser, StringParser } from '../parsers';
import { FIELDS, WithFields, wrap } from '../uri-types';

/**
 * The `application/yaml`, `application/x-yaml`, `text/vnd.yaml`, `text/x-yaml` and `text/yaml` parser handles
 * [YAML](https://yaml.org/) using [yaml](https://eemeli.org/yaml/) and {@link StringParser}.
 *
 * Only the first document in a multi-document YAML file is returned when parsing. To access all documents, use the
 * {@link FIELDS} property.
 *
 */
export class YAMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<object & WithFields<BasicTypes>> {
        const yaml = YAML.parseAllDocuments(await new StringParser(this.contentType).parse(stream));
        const json = yaml.map((yaml) => yaml.toJS({ json: true, mapAsMap: false, reviver: RecordReviver }) as BasicTypes);
        const data = wrap(json[0]);

        return json.length === 1 ? data : Object.defineProperty(data, FIELDS, { value: json });
    }

    serialize(data: BasicTypes): Buffer;
    serialize(data: BasicTypes & WithFields<BasicTypes>): Buffer {
        this._assertSerializebleData(data !== undefined, data);

        try {
            const entries = data?.[FIELDS] ?? [data];
            const strings = entries.map((entry) => YAML.stringify(entry));

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
