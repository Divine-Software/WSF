/* eslint-disable jsdoc/require-jsdoc */

import { Element, Node } from '@xmldom/xmldom';
import type { XML, XMLList } from '../x4e-types';
import { escapeXML, isAttribute, isComment, isElement, isEqualNode, isProcessingInstruction, isText, NodeListOf, parseXMLFromString } from '../xml-utils';

export const Call            = Symbol('Call');
export const Get             = Symbol('Get');
export const GetOwnProperty  = Symbol('GetOwnProperty');
export const HasProperty     = Symbol('HasProperty');
export const OwnPropertyKeys = Symbol('OwnPropertyKeys');
export const Value           = Symbol('Value');

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
export type ConvertableTypes = string | number | bigint | boolean | String | Number | BigInt | Boolean | XML<Node> | XMLList<Node> | Node;

export const nodeTypes = [
    null,
    'element',
    'attribute',
    'text',
    'cdata-section',
    'entity-reference',
    'entity',
    'processing-instruction',
    'comment',
    'document',
    'document-type',
    'document-fragment',
    'notation',
]

export function parseXMLFragment(fragment: string, defaultNamespace: string): Element {
    try {
        return parseXMLFromString(`<parent xmlns="${escapeXML(defaultNamespace)}">${fragment}</parent>`).documentElement!;
    }
    catch (err: any) {
        throw new SyntaxError(err.message ?? String(err));
    }
}

export function isInteger(i: number | string): i is number /* a lie! */ {
    return String(Number(i)) == i;
}

export function isArrayLike<T>(v: any): v is ArrayLike<T> {
    return typeof v?.length === 'number';
}

export function filerChildNodes<TNode extends Node = Node>(parent: Node, filter: (node: Node, index: number, parent: Node) => boolean): TNode[] {
    const elements: TNode[] = [];

    for (let node = parent.firstChild, index = 0; node; node = node.nextSibling, ++index) {
        if (filter(node, index, parent)) {
            elements.push(node as TNode);
        }
    }

    return elements;
}

export function getChildElementsByTagName(parent: Node, name?: string): Element[] {
    const namespaceURI = null /* FIXME */, localName = name ?? '*';

    return filerChildNodes<Element>(parent, (node) =>
        isElement(node) &&
        (localName === '*' || localName == node.localName) &&
        (namespaceURI === null || namespaceURI === node.namespaceURI));
}

export function domNodeList<TNode extends Node>(list: TNode[]): NodeListOf<TNode> {
    const nodeList = Object.create(list, {
        item:    { enumerable: false , value: (i: number) => list[i] ?? null },
        forEach: { enumerable: false , value: (cb: (value: TNode, key: number, parent: NodeListOf<TNode>) => void, thisArg?: any) => {
            list.forEach((value, key) => cb.call(thisArg, value, key, nodeList));
        }}
    });

    return nodeList;
}

// § 10.1.1 ToString Applied to the XML Type
export function nodeToString(node: Node): string {
    if (isAttribute(node) || isText(node)) {
        return node.nodeValue ?? '';
    }
    else if (nodeHasSimpleContent(node)) {
        let result = '';

        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (!isComment(child) && !isProcessingInstruction(child)) {
                result += nodeToString(child);
            }
        }

        return result;
    }
    else {
        return node.toString();
    }
}

// § 10.1.2 ToString Applied to the XMLList Type
export function listToString(nodes: Node[]): string {
    if (listHasSimpleContent(nodes)) {
        return nodes.map((node) => isComment(node) || isProcessingInstruction(node) ? '' : nodeToString(node)).join('');
    }
    else {
        return listToXMLString(nodes);
    }
}

// § 10.2.1 ToXMLString Applied to the XML Type (X4E: quite different)
export function nodeToXMLString(node: Node): string {
    return isAttribute(node) ? escapeXML(node.nodeValue ?? '') : node.toString();
}

// § 10.2.2 ToXMLString Applied to the XMLList Type
export function listToXMLString(nodes: Node[]): string {
    return nodes.map((node) => nodeToXMLString(node)).join('');
}

// § 13.4.4.15/13.4.4.16
export function nodeHasSimpleContent(node: Node): boolean {
    if (isComment(node) || isProcessingInstruction(node)) {
        return false;
    }
    else if (isText(node) || isAttribute(node)) {
        return true;
    }
    else {
        return getChildElementsByTagName(node, '*').length === 0;
    }
}

// § 13.5.4.13/13.5.4.14
export function listHasSimpleContent(nodes: Node[]): boolean {
    if (nodes.length === 0) {
        return true;
    }
    else if (nodes.length === 1) {
        return nodeHasSimpleContent(nodes[0]);
    }
    else {
        return nodes.every((node) => !isElement(node));
    }
}

// § 9.1.1.9 [[Equals]]
// § 11.5.1 The Abstract Equality Comparison Algorithm
export function nodesAreEqual(n1: Node, n2: Node): boolean {
    if ((isText(n1) || isAttribute(n1)) && nodeHasSimpleContent(n2) ||
        (isText(n2) || isAttribute(n2)) && nodeHasSimpleContent(n1)) {
        return nodeToString(n1) === nodeToString(n2);
    }
    else {
        return isEqualNode(n1, n2, true);
    }
}

export function listsAreEqual(l1: Node[], l2: Node[]): boolean {
    return l1.length === l2.length && l1.every((n1, idx) => nodesAreEqual(n1, l2[idx]));
}

export function nodesAreSame(n1: Node, n2: Node): boolean {
    return n1 === n2;
}

export function listsAreSame(l1: Node[], l2: Node[]): boolean {
    return l1.length == l2.length && l1.every((n1, idx) => nodesAreSame(n1, l2[idx]));
}
