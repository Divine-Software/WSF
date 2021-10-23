import { Parser, StringParser } from '@divine/uri';
import { isDOMNode, parseXMLFromString, serializeXMLToString, XML } from '@divine/x4e';

export class XMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<XML<Element>> {
        return XML(parseXMLFromString(await new StringParser(this.contentType).parse(stream)).documentElement);
    }

    serialize(data: Node | XML<Node>): Buffer {
        this._assertSerializebleData(isDOMNode(data) || data instanceof XML, data);

        return new StringParser(this.contentType).serialize(isDOMNode(data) ? serializeXMLToString(data) : data.$toXMLString());
    }
}

Parser.register('application/xml', XMLParser)
      .register('text/xml',        XMLParser)
;
