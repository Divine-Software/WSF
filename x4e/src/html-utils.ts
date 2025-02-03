import { Comment, Document, DocumentFragment, DocumentType, DOMImplementation, Element, Node, Text } from '@xmldom/xmldom';
import type * as AST from 'parse5';
import { parse, parseFragment, serialize } from 'parse5';
import { isAttribute, isComment, isDocument, isDocumentFragment, isDocumentType, isElement, isText } from './xml-utils';

interface XMLTreeAdapterTypeMap {
    node: Node;
    parentNode: Node;
    childNode: Node;
    document: Document;
    documentFragment: DocumentFragment;
    element: Element;
    commentNode: Comment;
    textNode: Text;
    template: Node;
    documentType: DocumentType;
}

export {
    escapeXML as escapeHTML,
    escapeXMLAttribute as escapeHTMLAttribute
} from './xml-utils';

export function parseHTMLFromString(document: string): Document {
    return parse<XMLTreeAdapterTypeMap>(document, { treeAdapter: new XMLTreeAdapter() });
}

export function parseHTMLFragmentFromString(fragment: string): DocumentFragment {
    return parseFragment<XMLTreeAdapterTypeMap>(fragment, { treeAdapter: new XMLTreeAdapter() });
}

export function serializeHTMLToString(node: Node): string {
    if (node.parentNode && isDocument(node.parentNode)) {
        node = node.parentNode;
    }
    else if (!isDocument(node) && !isDocumentFragment(node) && !isAttribute(node)) {
        // Hackelihack: Make a parent that is parsable by XMLTreeAdapter.getChildNodes()
        const documentElement = node;

        node = {
            childNodes: {
                length: 1,
                item:   () => documentElement,
            }
        } as unknown as Node;
    }

    return serialize<XMLTreeAdapterTypeMap>(node, { treeAdapter: new XMLTreeAdapter() });
}

class XMLTreeAdapter implements AST.TreeAdapter<XMLTreeAdapterTypeMap> {
    private _root: Document;
    private _created  = false;
    private _template = Symbol('template');
    private _docMode  = Symbol('docMode');
    private _location = Symbol('location');

    constructor() {
        // @ts-expect-error: Argument of type 'null' is not assignable to parameter of type 'string'.ts(2345)
        this._root = new DOMImplementation().createDocument(null, null, null);
    }

    createDocument(): Document {
        if (this._created) {
            throw new Error('XMLTreeAdapter can only create one document per instance');
        }
        else {
            this._created = true;
            return this._root;
        }
    }

    createDocumentFragment(): DocumentFragment {
        return this._root.createDocumentFragment();
    }

    createElement(tagName: string, namespaceURI: AST.html.NS, attrs: AST.Token.Attribute[]): Element {
        const element = this._root.createElementNS(namespaceURI, tagName);

        for (const attr of attrs) {
            if (attr.namespace) {
                element.setAttributeNS(attr.namespace, `${attr.prefix}:${attr.name}`, attr.value);
            }
            else {
                element.setAttribute(attr.name, attr.value);
            }
        }

        return element;
    }

    createCommentNode(data: string): Comment {
        return this._root.createComment(data);
    }

    createTextNode(value: string): Text {
        return this._root.createTextNode(value);
    }

    appendChild(parentNode: Node, newNode: Node): void {
        parentNode.appendChild(newNode);
    }

    insertBefore(parentNode: Node, newNode: Node, referenceNode: Node): void {
        parentNode.insertBefore(newNode, referenceNode);
    }

    setTemplateContent(templateElement: Element, contentElement: DocumentFragment): void {
        (templateElement as any)[this._template] = contentElement;
    }

    getTemplateContent(templateElement: Element): DocumentFragment {
        return (templateElement as any)[this._template];
    }

    setDocumentType(_document: Document, name: string, publicId: string, systemId: string): void {
        console.log('setDocumentType not supported', name, publicId, systemId);
    }

    setDocumentMode(document: Document, mode: AST.html.DOCUMENT_MODE): void {
        (document as any)[this._docMode] = mode;
    }

    getDocumentMode(document: Document): AST.html.DOCUMENT_MODE {
        return (document as any)[this._docMode];
    }

    getNodeSourceCodeLocation(node: Node): AST.Token.ElementLocation | undefined | null {
        return (node as any)[this._location];
    }

    setNodeSourceCodeLocation(node: Node, location: AST.Token.ElementLocation | null): void {
        (node as any)[this._location] = location;
    }

    updateNodeSourceCodeLocation(node: Node, location: Partial<AST.Token.ElementLocation>): void {
        Object.assign((node as any)[this._location], location);
    }

    detachNode(node: Node): void {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    insertText(parentNode: Node, text: string): void {
        parentNode.appendChild(this._root.createTextNode(text)); // FIXME: Optimize
    }

    insertTextBefore(parentNode: Node, text: string, referenceNode: Node): void {
        parentNode.insertBefore(this._root.createTextNode(text), referenceNode); // FIXME: Optimize
    }

    adoptAttributes(recipient: Element, attrs: AST.Token.Attribute[]): void {
        for (const attr of attrs) {
            if (attr.namespace) {
                if (!recipient.hasAttributeNS(attr.namespace, attr.name)) {
                    recipient.setAttributeNS(attr.namespace, `${attr.prefix}:${attr.name}`, attr.value);
                }
            }
            else {
                if (recipient.hasAttribute(attr.name)) {
                    recipient.setAttribute(attr.name, attr.value);
                }
            }
        }
    }

    getFirstChild(node: Node): Node {
        return node.firstChild!;
    }

    getChildNodes(node: Node): Node[] {
        const nodes: Node[] = [];

        for (let i = 0; i < node.childNodes.length; ++i) {
            nodes.push(node.childNodes.item(i)!);
        }

        return nodes;
    }

    getParentNode(node: Node): Node {
        return node.parentNode!;
    }

    getAttrList(element: Element): AST.Token.Attribute[] {
        const attrs = [];

        for (let i = 0; i < element.attributes.length; ++i) {
            const attr = element.attributes.item(i)!;
            attrs.push({
                name:      attr.name,
                value:     attr.value,
                namespace: attr.namespaceURI || undefined,
                prefix:    attr.prefix || undefined,
            });
        }

        return attrs;
    }

    getTagName(element: Element): string {
        return element.tagName;
    }

    getNamespaceURI(element: Element): AST.html.NS {
        return element.namespaceURI as AST.html.NS;
    }

    getTextNodeContent(textNode: Text): string {
        return textNode.nodeValue!;
    }

    getCommentNodeContent(commentNode: Comment): string {
        return commentNode.nodeValue!;
    }

    getDocumentTypeNodeName(doctypeNode: DocumentType): string {
        return doctypeNode.name;
    }

    getDocumentTypeNodePublicId(doctypeNode: DocumentType): string {
        return doctypeNode.publicId;
    }

    getDocumentTypeNodeSystemId(doctypeNode: DocumentType): string {
        return doctypeNode.systemId;
    }

    isTextNode(node: Node): node is Text {
        return isText(node);
    }

    isCommentNode(node: Node): node is Comment {
        return isComment(node);
    }

    isDocumentTypeNode(node: Node): node is DocumentType {
        return isDocumentType(node);
    }

    isElementNode(node: Node): node is Element {
        return isElement(node);
    }
}
