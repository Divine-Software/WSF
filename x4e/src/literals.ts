import { escapeHTMLAttribute, parseHTMLFragmentFromString, parseHTMLFromString } from './html-utils';
import { XML, XMLList } from './x4e';
import { escapeXMLAttribute, NS_DEFAULT, NS_XHTML } from './xml-utils';

// § 8.3 XML Initialiser Input Elements (X4E: Not quite)
// § 11.1.5 XMLList Initialiser (X4E: Not quire)

type XMLLiteral  = <TNode extends Node = Element>(strings: TemplateStringsArray, ...values: unknown[]) => XML<TNode>;
type XMLListLiteral = <TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]) => XMLList<TNode>;

export function xmlNS(defaultNamespace: string): XMLLiteral {
    return function xml<TNode extends Node = Element>(strings: TemplateStringsArray, ...values: unknown[]): XML<TNode> {
        return XML(strings[0] + values.map((value, i) => escapeXMLAttribute(String(value)) + strings[i + 1]).join(''), defaultNamespace);
    }
}

export function xmlListNS(defaultNamespace: string): XMLListLiteral {
    return function xmlList<TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]): XMLList<TNode> {
        return XMLList(strings[0] + values.map((value, i) => escapeXMLAttribute(String(value)) + strings[i + 1]).join(''), defaultNamespace);
    }
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): XML<Element> {
    return XML(parseHTMLFromString(strings[0] + values.map((value, i) => escapeHTMLAttribute(String(value)) + strings[i + 1]).join('')).documentElement);
}

export function htmlList<TNode extends Node = Node>(strings: TemplateStringsArray, ...values: unknown[]): XMLList<TNode> {
    return XML(parseHTMLFragmentFromString(strings[0] + values.map((value, i) => escapeHTMLAttribute(String(value)) + strings[i + 1]).join(''))).$children() as XMLList<TNode>;
}

export const xml       = xmlNS(NS_DEFAULT);
export const xhtml     = xmlNS(NS_XHTML);

export const xmlList   = xmlListNS(NS_DEFAULT);
export const xhtmlList = xmlListNS(NS_XHTML);
