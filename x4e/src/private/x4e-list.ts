import { Node } from '@xmldom/xmldom';
import { inspect } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { isDOMNode, isElement } from '../xml-utils';
import { asXML, asXMLList } from './x4e-magic';
import { GetProp, X4E } from './x4e-node';
import { ConvertableTypes, Get, GetOwnProperty, isArrayLike, isInteger, listHasSimpleContent, listsAreEqual, listsAreSame, listToString, listToXMLString, nodeHasSimpleContent, parseXMLFragment, Value } from './x4e-utils';

export class X4EList<TNode extends Node> extends X4E<TNode> {
    constructor(value: TNode | ArrayLike<TNode> | undefined | null) {
        super(value ?? []);
    }

    // § 9.2.1.1 (X4E: attributes optional)
    override [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined {
        if (isInteger(name)) {
            return this[Value][name];
        }
        else {
            return this[Value].flatMap((node) => isElement(node) ? GetProp(node, name, allowAttributes)! : []);
        }
    }

    // § 12.2 The for-in Statement
    override [GetOwnProperty](p: string): PropertyDescriptor | undefined {
        const node = isInteger(p) && this[Value][p];

        return node
            ? { value: asXML(node), writable: true, enumerable: true, configurable: true }
            : undefined;
    }

    // § 12.3 The for-each-in Statement (X4E: for-of)
    override *[Symbol.iterator](): Generator<XML<TNode>> {
        for (const node of this[Value]) {
            yield asXML(node);
        }
    }

    // § 11.2.4 XML Filtering Predicate Operator (X4E: as method)
    override $filter(predicate: (node: XML<TNode>, index: number, parent: XMLList<TNode>) => boolean): XMLList<TNode> {
        return super.$filter(predicate as any);
    }

    // § 9.2.1.9 [[Equals]] (X4E: $isEqual() for Abstract Node Equality and $isSame() for Strict Node Equality)
    // § 11.5.1 The Abstract Equality Comparison Algorithm
    override $isEqual(that: unknown): boolean {
        const l1 = this[Value];

        if (l1.length === 0 && that == /* [sic!] */ undefined) {
            return true;
        }
        else if (that instanceof X4EList) {
            return listsAreEqual(l1, that[Value]);
        }
        else if (l1.length === 1) {
            return super.$isEqual(that);
        }
        else {
            return false;
        }
    }

    override $isSame(that: XMLList<Node>): boolean {
        return that instanceof X4EList && listsAreSame(this[Value], that[Value]);
    }

    // § 13.5.4.1 constructor

    // § 13.5.4.2 $attribute(name: string): XMLList<Attr>

    // § 13.5.4.3 $attributes(): XMLList<Attr>

    // § 13.5.4.4 $child(name: string | number): XMLList<Node>

    // § 13.5.4.5 $children(): XMLList<Node>

    // § 13.5.4.6 $comments(): XMLList<Comment>

    // § 13.5.4.7 constructor

    // § 13.5.4.8
    override $contains(value: unknown): boolean {
        return this[Value].some((node) => new X4E(node).$isEqual(value));
    }

    // § 13.5.4.9
    override $copy(): this {
        return asXMLList(this[Value].map((node) => node.cloneNode(true))) as any;
    }

    // § 13.5.4.10 $descendants(name?: string): XMLList<Element>

    // § 13.5.4.11 $elements(name?: string): XMLList<Element>

    // § 13.5.4.12 hasOwnProperty

    // § 13.5.4.13
    override $hasComplexContent(): boolean {
        if (this[Value].length === 0) {
            return false;
        }
        else if (this[Value].length === 1) {
            return !nodeHasSimpleContent(this[Value][0]);
        }
        else {
            return this[Value].some((node) => isElement(node));
        }
    }

    // 13.5.4.14
    override $hasSimpleContent(): boolean {
        return listHasSimpleContent(this[Value]);
    }

    // § 13.5.4.15 $length(): number

    // § 13.5.4.16 $normalize(): this

    // § 13.5.4.17 $parent(): XML<Element | Document | DocumentFragment> | null | undefined

    // § 13.5.4.18 $processingInstructions(name?: string): XMLList<ProcessingInstruction>

    // § 13.5.4.19 propertyIsEnumerable

    // § 13.5.4.20 $text(): XMLList<Text>

    // § 13.5.4.21
    override $toString(): string {
        return listToString(this[Value]);
    }

    override toString(): string {
        return listToString(this[Value]);
    }

    // § 13.5.4.22
    override $toXMLString(): string {
        return listToXMLString(this[Value]);
    }

    // § 13.5.4.23 valueOf

    // A.2.1 $domNode(): TNode | undefined

    // A.2.2 $domNodeList(): NodeListOf<TNode>

    // A.2.3 xpath (not yet implemented)
}

// Custom Node.js inspector value
(X4EList.prototype as any)[inspect.custom] = function(this: X4EList<Node>) {
    return this[Value].map((node) => node.toString());
}

// § 10.4 (X4E: Explicit default namespace & copy)
export function ToXMLList(value: ConvertableTypes | ArrayLike<Node>, defaultNamespace: string, shallowCopy: boolean): XMLList<Node> {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean' ||
        value instanceof String || value instanceof Number || value instanceof BigInt || value instanceof Boolean) {

        value = asXMLList(parseXMLFragment(String(value).replace(/^<>|<\/>$/g, '') /* Remove <> and </> */, defaultNamespace).childNodes);
        shallowCopy = false;
    }
    else if (isDOMNode(value) || isArrayLike(value) && Array.from(value).every((node) => isDOMNode(node))) {
        value = asXMLList(value);
        shallowCopy = false;
    }

    if (value instanceof X4EList) {
        return shallowCopy ? asXMLList(value.$domNodeList()) : (value as XMLList<Node>);
    }
    else if (value instanceof X4E) {
        return asXMLList(value.$domNode());
    }
    else {
        throw new TypeError(`Cannot convert ${value} to XML`);
    }
}
