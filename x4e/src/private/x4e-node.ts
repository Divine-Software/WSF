import { inspect } from 'util';
import type { XML, XMLList } from '../x4e-types';
import { isComment, isDOMNode, isElement, isProcessingInstruction, isText } from '../xml-utils';
import { X4EList } from './x4e-list';
import { asXML, asXMLList, CallMethod, X4EProxyTarget } from './x4e-magic';
import { Call, ConvertableTypes, domNodeList, ElementLike, filerChildNodes, Get, getChildElementsByTagName, GetOwnProperty, HasProperty, isInteger, nodeHasSimpleContent, nodesAreEqual, nodesAreSame, nodeToString, nodeToXMLString, nodeTypes, OwnPropertyKeys, parseXMLFragment, Value } from './x4e-utils';

function singleNode<TNode extends Node>(x4e: X4E<TNode>, func: string): TNode & ElementLike {
    const values = x4e[Value];

    if (values.length !== 1) {
        throw new TypeError(`${func}() can only be used on one single node (found ${values.length})`);
    }

    return values[0];
}

function eachNode<TNode extends Node, RNode extends Node>(x4e: X4E<TNode>, fn: (node: TNode & ElementLike) => undefined | RNode | RNode[]): XMLList<RNode> {
    const values = x4e[Value];

    return asXMLList<RNode>(values.length === 1 ? fn(values[0]) : values.flatMap((node) => fn(node) ?? []));
}

export class X4E<TNode extends Node> implements X4EProxyTarget, Iterable<XML<TNode>> {
    private [Value]: Array<TNode & ElementLike>;

    constructor(node: TNode | ArrayLike<TNode>) {
        this[Value] = isDOMNode(node) ? [ node ] : Array.from(node);
    }

    // § 9.1.1.1 (X4E: attributes optional)
    [Get](name: string | number, allowAttributes: boolean): Node | Node[] | undefined {
        return GetProp(this[Value][0], name, allowAttributes);
    }

    // § 9.1.1.6 (X4E: attributes optional)
    // § 9.2.1.5 (X4E: attributes optional)
    [HasProperty](name: string | number, allowAttributes: boolean): boolean {
        const propValue = this[Get](name, allowAttributes);

        return Array.isArray(propValue) ? propValue.length > 0 : !!propValue ;
    }

    // 11.2.2.1 CallMethod (X4E: Not really)
    [Call]?: CallMethod;

    // § 12.2 The for-in Statement
    [OwnPropertyKeys](): string[] {
        return Object.keys(this[Value]);
    }

    // § 12.2 The for-in Statement
    [GetOwnProperty](p: string): PropertyDescriptor | undefined {
        return p === '0'
            ? { value: this, writable: true, enumerable: true, configurable: true }
            : undefined;
    }

    // § 12.3 The for-each-in Statement (X4E: for-of)
    *[Symbol.iterator](): Iterator<XML<TNode>> {
        yield this as unknown as XML<TNode>;
    }

    // § 11.2.1 Property Accessors (X4E: tagged template alias for attributes)
    $(name: TemplateStringsArray): XMLList<Attr> {
        return this.$attribute(name[0]);
    }

    // § 11.2.3 XML Descendant Accessor (X4E: tagged template alias)
    $$(name: TemplateStringsArray): XMLList<Element> {
        return this.$descendants(name[0]);
    }

    // § 11.2.4 XML Filtering Predicate Operator (X4E: as method)
    $filter(predicate: (node: XML<TNode>, index: number, parent: XML<TNode>) => boolean): XMLList<TNode> {
        return asXMLList(this[Value].filter((node, index) => predicate(asXML(node), index, this as unknown as XML<TNode>)));
    }

    // § 9.1.1.9 [[Equals]] (X4E: $isEqual() for Abstract Node Equality and $isSame() for Strict Node Equality)
    // § 11.5.1 The Abstract Equality Comparison Algorithm
    $isEqual(that: unknown): boolean {
        const node = singleNode(this, '$isEqual');

        if (that instanceof X4EList) {
            return that.$isEqual(this);
        }
        else if (that instanceof X4E) {
            return nodesAreEqual(node, singleNode(that, '$isEqual'));
        }
        else if (nodeHasSimpleContent(node)) {
            return nodeToString(node) === String(that);
        }
        else {
            return false;
        }
    }

    $isSame(that: XML<Node>): boolean {
        return Object.getPrototypeOf(that) === X4E.prototype && nodesAreSame(singleNode(this, '$isSame'), singleNode(that as unknown as X4E<Node>, '$isSame'));
    }

    // § 13.4.4.1 constructor

    // § 13.4.4.2 addNamespace

    // § 13.4.4.3 appendChild

    // § 13.4.4.4
    // § 13.5.4.2
    $attribute(name: string): XMLList<Attr> {
        return eachNode(this, (node) => GetProp(node, `@${name}` as '@*', true));
    }

    // § 13.4.4.5
    // § 13.5.4.2
    $attributes(): XMLList<Attr> {
        return eachNode(this, (node) => GetProp(node, `@*`, true));
    }

    // § 13.4.4.6
    // § 13.5.4.3
    $child(name: string | number): XMLList<Node> {
        if (isInteger(name)) {
            return eachNode(this, (node) => GetProp(node, '*', false)[name]);
        }
        else {
            return eachNode(this, (node) => GetProp(node, name, false) ?? []);
        }
    }

    // § 13.4.4.7
    // $childIndex(): number {
    // }

    // § 13.4.4.8
    // § 13.5.4.5
    $children(): XMLList<Node> {
        return eachNode(this, (node) => GetProp(node, '*', false));
    }

    // § 13.4.4.9
    // § 13.5.4.6
    $comments(): XMLList<Comment> {
        return eachNode(this, (node) => filerChildNodes<Comment>(node, (child) => isComment(child)));
    }

    // § 13.4.4.10
    $contains(value: unknown): boolean {
        return this.$isEqual(value);
    }

    // § 13.4.4.11
    $copy(): this {
        return asXML(singleNode(this, '$copy').cloneNode(true)) as any;
    }

    // § 13.4.4.12
    // § 13.5.4.10
    $descendants(name?: string): XMLList<Element> {
        // FIXME: Not sure we're allowed to just call getElementsByTagName() ...
        return eachNode(this, (node) => Array.from(node.getElementsByTagName?.(name ?? '*') ?? []));
    }

    // § 13.4.4.13
    // § 13.5.4.11
    $elements(name?: string): XMLList<Element> {
        return eachNode(this, (node) => getChildElementsByTagName(node, name ?? '*'));
    }

    // § 13.4.4.14 hasOwnProperty

    // § 13.4.4.15
    $hasComplexContent(): boolean {
        return !nodeHasSimpleContent(singleNode(this, '$hasComplexContent'));
    }

    // § 13.4.4.16
    $hasSimpleContent(): boolean {
        return nodeHasSimpleContent(singleNode(this, '$hasSimpleContent'));
    }

    // § 13.4.4.17 inScopeNamespaces

    // § 13.4.4.18 insertChildAfter

    // § 13.4.4.19 insertChildBefore

    // § 13.4.4.20
    $length(): number {
        return this[Value].length;
    }

    // § 13.4.4.21
    $localName(): string | null {
        const node = singleNode(this, '$localName');

        return node.localName ?? node.nodeName ?? null;
    }

    // § 13.4.4.22
    $name(): string | null {
        return singleNode(this, '$name').nodeName;
    }

    // § 13.4.4.23 namespace

    // § 13.4.4.24 namespaceDeclarations

    // § 13.4.4.25
    $nodeKind(): string {
        return nodeTypes[singleNode(this, '$nodeKind').nodeType] ?? 'unknown';
    }

    // § 13.4.4.26 (the X4E way?)
    $normalize(): this {
        this[Value].forEach((node) => node.normalize());
        return this;
    }

    // § 13.4.4.27
    $parent(): XML<Element | Document | DocumentFragment> | null | undefined {
        if (this[Value].length === 0) {
            return undefined;
        }
        else {
            const parent = this[Value][0].parentNode as Element | Document | DocumentFragment;

            return this[Value].every((node) => node.parentNode === parent) ? asXML(parent) : undefined;
        }
    }

    // § 13.4.4.28
    // § 13.5.4.18
    $processingInstructions(name?: string): XMLList<ProcessingInstruction> {
        name = name ?? '*';

        return eachNode(this, (node) => filerChildNodes(node, (child) => isProcessingInstruction(child) && (name === '*' || name === child.nodeName)));
    }

    // § 13.4.4.29 prependChild

    // § 13.4.4.30 propertyIsEnumerable

    // § 13.4.4.31 removeNamespace

    // § 13.4.4.32 replace

    // § 13.4.4.33 setChildren

    // § 13.4.4.34 setLocalName

    // § 13.4.4.35 setName

    //§ 13.4.4.36 setNamespace

    // § 13.4.4.37
    // § 13.5.4.20
    $text(): XMLList<Text> {
        return eachNode(this, (node) => filerChildNodes(node, (child) => isText(child)));
    }

    // § 13.4.4.38
    $toString(): string {
        return nodeToString(singleNode(this, '$toString'));
    }

    toString(): string {
        return nodeToString(singleNode(this, 'toString'));
    }

    // § 13.4.4.39
    $toXMLString(): string {
        return nodeToXMLString(singleNode(this, '$toXMLString'));
    }

    // § 13.4.4.40 valueOf

    // § A.1.1
    $domNode(): TNode | undefined {
        return this[Value].length === 1 ? this[Value][0] : undefined;
    }

    // § A.1.2
    $domNodeList(): NodeListOf<TNode> {
        return domNodeList(this[Value]);
    }

    // A.1.3 xpath (not yet implemented)
}

// Custom Node.js inspector value
(X4E.prototype as any)[inspect.custom] = function(this: X4E<Node>) {
    return this[Value][0].toString();
}

export function GetProp(node: Node & ElementLike, name: number, allowAttributes: boolean): Node | undefined;
export function GetProp(node: Node & ElementLike, name: '*',    allowAttributes: boolean): Node[];
export function GetProp(node: Node & ElementLike, name: '@*',   allowAttributes: true): Attr[];
export function GetProp(node: Node & ElementLike, name: string | number, allowAttributes: boolean): Node | Node[] | undefined;
export function GetProp(node: Node & ElementLike, name: string | number, allowAttributes: boolean): Node | Node[] | undefined {
    if (isInteger(name)) {
        return [node][name];
    }
    else if (allowAttributes && name[0] === '@') {
        const namespaceURI = null /* FIXME */, localName = name.substr(1);

        return Array.from(node.attributes ?? []).filter((attr) =>
            (localName    === '*'  || localName    === attr.localName) &&
            (namespaceURI === null || namespaceURI === attr.namespaceURI));
    }
    else {
        const namespaceURI = null /* FIXME */, localName = name;

        return filerChildNodes(node, (child) =>
            (localName    === '*'  || isElement(child) && localName    === child.localName) &&
            (namespaceURI === null || isElement(child) && namespaceURI === child.namespaceURI));
    }
}

// § 10.3 (X4E: Explicit default namespace & copy)
export function ToXML(value: ConvertableTypes, defaultNamespace: string, deepCopy: boolean): XML<Node> {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean' ||
        value instanceof String || value instanceof Number || value instanceof BigInt || value instanceof Boolean) {

        const parent = parseXMLFragment(String(value), defaultNamespace);

        if (parent.childNodes.length === 0) {
            value = parent.ownerDocument.createTextNode('');
        }
        else if (parent.childNodes.length === 1) {
            value = parent.childNodes[0];
        }
        else {
            throw new SyntaxError(`XML objects can hold only one Node`);
        }

        deepCopy = false;
    }

    if (value instanceof X4EList) {
        value = value as XMLList<Node>;

        const node = value.$domNode();

        if (node) {
            return asXML(deepCopy ? node.cloneNode(true) : node);
        }
        else {
            throw new TypeError(`Cannot convert XMLList with length ${value.$length()} to XML`);
        }
    }
    else if (value instanceof X4E) {
        return (deepCopy ? value.$copy() : value) as XML<Node>;
    }
    else if (isDOMNode(value)) {
        return asXML(deepCopy ? value.cloneNode(true) : value);
    }
    else {
        throw new TypeError(`Cannot convert ${value} to XML`);
    }
}
