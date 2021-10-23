import { Parser, StringParser } from '@divine/uri';
import { isDOMNode, parseHTMLFromString, serializeHTMLToString, XML } from '@divine/x4e';

export class HTMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<XML<Element>> {
        return XML(parseHTMLFromString(await new StringParser(this.contentType).parse(stream)).documentElement);
    }

    serialize(data: Node | XML<Node>): Buffer {
        this._assertSerializebleData(isDOMNode(data) || data instanceof XML, data);

        return new StringParser(this.contentType).serialize(isDOMNode(data) ? serializeHTMLToString(data) : data.$toXMLString());
    }
}

Parser.register('text/html', HTMLParser);
