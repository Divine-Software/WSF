import { Parser, StringParser } from '@divine/uri';
import { isDOMNode, parseHTMLFromString, serializeHTMLToString, XML } from '@divine/x4e';
import { Element, Node } from '@xmldom/xmldom';

/**
 * The `text/html` parser uses [parse5](https://github.com/inikulin/parse5) to convert HTML documents to and from
 * X4E {@link XML} objects.
 */
export class HTMLParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<XML<Element>> {
        return XML(parseHTMLFromString(await new StringParser(this.contentType).parse(stream)).documentElement);
    }

    serialize(data: Node | XML<Node>): Buffer {
        this._assertSerializebleData(isDOMNode(data) || data instanceof XML, data);

        return new StringParser(this.contentType).serialize(serializeHTMLToString(isDOMNode(data) ? data : data.$domNode()));
    }
}

Parser.register('text/html', HTMLParser);
