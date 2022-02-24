import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const NS_DEFAULT   = '';
export const NS_XHTML     = 'http://www.w3.org/1999/xhtml';
export const NS_ATOM      = 'http://www.w3.org/2005/Atom';
export const NS_SOAP      = 'http://www.w3.org/2003/05/soap-envelope';
export const NS_WDSL      = 'http://www.w3.org/ns/wsdl';
export const NS_XLINK     = 'http://www.w3.org/1999/xlink';
export const NS_XMLSCHEMA = 'http://www.w3.org/2001/XMLSchema';
export const NS_XSLT      = 'http://www.w3.org/1999/XSL/Transform';

const ELEMENT_NODE                = 1;
const ATTRIBUTE_NODE              = 2;
const TEXT_NODE                   = 3;
// const CDATA_SECTION_NODE          = 4;
// const ENTITY_REFERENCE_NODE       = 5;
// const ENTITY_NODE                 = 6;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE                = 8;
const DOCUMENT_NODE               = 9;
const DOCUMENT_TYPE_NODE          = 10;
const DOCUMENT_FRAGMENT_NODE      = 11;
// const NOTATION_NODE               = 12;

function N<T>(v: T) {
    // xmldom is broken
    return v ?? null;
}

function isEqualDocumentType(dt1: DocumentType, dt2: DocumentType, _x4eMode: boolean): boolean {
    return dt1.name === dt2.name
        && dt1.publicId === dt2.publicId
        && dt1.systemId === dt2.systemId;
}

function isEqualElement(e1: Element, e2: Element, x4eMode: boolean): boolean {
    return N(e1.namespaceURI)           === N(e2.namespaceURI)
        && (x4eMode || N(e1.prefix)     === N(e2.prefix)) // Not accordning to § 9.1.1.9 [[Equals]]
        && (e1.localName ?? e1.tagName) === (e2.localName ?? e2.tagName)
        && isEqualElementAttrs(e1, e2, x4eMode);
}

function isEqualElementAttrs(e1: Element, e2: Element, x4eMode: boolean): boolean {
    // xmldom is sooo broken :(
    const a1 = Array.from(e1.attributes).filter((a) => a.prefix !== 'xmlns' && a.name !== 'xmlns');
    const a2 = Array.from(e2.attributes).filter((a) => a.prefix !== 'xmlns' && a.name !== 'xmlns');

    if (a2.length !== a2.length) {
        return false;
    }

    const a1m = new Map(Array.from(a1).map((a) => [`${N(a.namespaceURI)}:${a.localName ?? a.nodeName}`, a]));
    return Array.from(a2).every((a) => isEqualNode(a, a1m.get(`${N(a.namespaceURI)}:${a.localName ?? a.nodeName}`), x4eMode));
}

function isEqualAttr(a1: Attr, a2: Attr, x4eMode: boolean): boolean {
    return N(a1.namespaceURI)            === N(a2.namespaceURI)
        && (x4eMode || N(a1.prefix)      === N(a2.prefix)) // NOTE: According to DOM L3, but not DOM L4?? Also not accordning to § 9.1.1.9 [[Equals]]
        && (a1.localName ?? a1.nodeName) === (a2.localName ?? a2.nodeName)
        && a1.value                      === a2.value;
}

function isEqualProcessingInstruction(pi1: ProcessingInstruction, pi2: ProcessingInstruction, _x4eMode: boolean): boolean {
    return pi1.target === pi2.target
        && pi1.data   === pi2.data;
}

function isEqualText(t1: Text, t2: Text, _x4eMode: boolean): boolean {
    return t1.data === t2.data;
}

function isEqualComment(t1: Comment, t2: Comment, _x4eMode: boolean): boolean {
    return t1.data === t2.data;
}

// Implementation of Node.isEqualNode(other), sort of according to https://dom.spec.whatwg.org/#concept-node-equals
// and/or https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isEqualNode.
export function isEqualNode(n1: Node, n2: Node | undefined | null, x4eMode: boolean): boolean {
    if (n1.nodeType !== n2?.nodeType || n1.childNodes?.length !== n2.childNodes?.length) {
        return false;
    }

    switch (n1.nodeType) {
        case DOCUMENT_TYPE_NODE:          if (!isEqualDocumentType          (n1 as any, n2 as any, x4eMode)) return false; break;
        case ELEMENT_NODE:                if (!isEqualElement               (n1 as any, n2 as any, x4eMode)) return false; break;
        case ATTRIBUTE_NODE:              if (!isEqualAttr                  (n1 as any, n2 as any, x4eMode)) return false; break;
        case PROCESSING_INSTRUCTION_NODE: if (!isEqualProcessingInstruction (n1 as any, n2 as any, x4eMode)) return false; break;
        case TEXT_NODE:                   if (!isEqualText                  (n1 as any, n2 as any, x4eMode)) return false; break;
        case COMMENT_NODE:                if (!isEqualComment               (n1 as any, n2 as any, x4eMode)) return false; break;
    }

    return Array.from(n1.childNodes ?? []).every((cn1, idx) => isEqualNode(cn1, n2.childNodes[idx], x4eMode));
}

const escapeMap: { [c: string]: string | undefined } = {
    '<':  '&lt;',
    '>':  '&gt;',
    '&':  '&amp;',
    '"':  '&quot;',
    "'":  '&apos;',
    "\t": '&#x9;',
    "\n": '&#xA;',
    "\r": '&#xD;',
}

export function escapeXML(value: string): string {
    return value.replace(/[<>&'"]/g, (c) => escapeMap[c] ?? '');
}

export function escapeXMLAttribute(value: string): string {
    return value.replace(/[<>&'"\t\n\r]/g, (c) => escapeMap[c] ?? '');
}

export function parseXMLFromString(document: string): Document {
    return new DOMParser().parseFromString(document, 'application/xml');
}

export function serializeXMLToString(node: Node): string {
    return new XMLSerializer().serializeToString(node);
}

export function isDOMNode(obj: unknown): obj is Node {
    return !!obj && typeof (obj as Node).nodeType === 'number';
}

export function isElement(node: Node): node is Element {
    return node.nodeType === ELEMENT_NODE;
}

export function isAttribute(node: Node): node is Attr {
    return node.nodeType === ATTRIBUTE_NODE;
}

export function isText(node: Node): node is Text {
    return node.nodeType === TEXT_NODE;
}

export function isProcessingInstruction(node: Node): node is ProcessingInstruction {
    return node.nodeType === PROCESSING_INSTRUCTION_NODE;
}

export function isComment(node: Node): node is Comment {
    return node.nodeType === COMMENT_NODE;
}

export function isDocument(node: Node): node is Document {
    return node.nodeType === DOCUMENT_NODE;
}

export function isDocumentType(node: Node): node is DocumentType {
    return node.nodeType === DOCUMENT_TYPE_NODE;
}

export function isDocumentFragment(node: Node): node is DocumentFragment {
    return node.nodeType === DOCUMENT_FRAGMENT_NODE;
}
