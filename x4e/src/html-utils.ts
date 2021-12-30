import type * as AST from 'parse5';
import { parse, parseFragment, serialize } from 'parse5';
import { DOMImplementation } from 'xmldom';
import { isAttribute, isComment, isDocument, isDocumentFragment, isDocumentType, isElement, isText } from './xml-utils';

export {
    escapeXML          as escapeHTML,
    escapeXMLAttribute as escapeHTMLAttribute
} from './xml-utils';

export function parseHTMLFromString(document: string): Document {
    return parse(document, { treeAdapter: new XMLTreeAdapter() }) as unknown as Document;
}

export function parseHTMLFragmentFromString(fragment: string): DocumentFragment {
    return parseFragment(fragment, { treeAdapter: new XMLTreeAdapter() }) as unknown as DocumentFragment;
}

export function serializeHTMLToString(node: Node): string {
    if (node.parentNode && isDocument(node.parentNode)) {
        node = node.parentNode;
    }
    else if (!isDocument(node) && !isDocumentFragment(node) && !isAttribute(node)) {
        // Hackelihack
        const documentElement = node;

        node = {
            childNodes: {
                length: 1,
                item:   () => documentElement,
            }
        } as unknown as Document;
    }

    return serialize(node as any, { treeAdapter: new XMLTreeAdapter() });
}

class XMLTreeAdapter implements AST.TreeAdapter {
    private _root: Document;
    private _created  = false;
    private _template = Symbol('template');
    private _docMode  = Symbol('docMode');
    private _location = Symbol('location');

    constructor() {
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

    createElement(tagName: string, namespaceURI: string, attrs: AST.Attribute[]): Element {
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

    setDocumentMode(document: Document, mode: AST.DocumentMode): void {
        (document as any)[this._docMode] = mode;
    }

    getDocumentMode(document: Document): AST.DocumentMode {
        return (document as any)[this._docMode];
    }

    getNodeSourceCodeLocation(node: Node): AST.Location | AST.ElementLocation {
        return (node as any)[this._location];
    }

    setNodeSourceCodeLocation(node: Node, location: AST.Location | AST.ElementLocation): void {
        (node as any)[this._location] = location;
    }

    updateNodeSourceCodeLocation(node: Node, location: AST.EndLocation): void {
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

    adoptAttributes(recipient: Element, attrs: AST.Attribute[]): void {
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
        const nodes = [];

        for (let i = 0; i < node.childNodes.length; ++i) {
            nodes.push(node.childNodes.item(i));
        }

        return nodes;
    }

    getParentNode(node: Node): Node {
        return node.parentNode!;
    }

    getAttrList(element: Element): AST.Attribute[] {
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

    getNamespaceURI(element: Element): string {
        return element.namespaceURI!;
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

    isTextNode(node: Node): boolean {
        return isText(node);
    }

    isCommentNode(node: Node): boolean {
        return isComment(node);
    }

    isDocumentTypeNode(node: Node): boolean {
        return isDocumentType(node);
    }

    isElementNode(node: Node): boolean {
        return isElement(node);
    }
}
