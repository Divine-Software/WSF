/* eslint-disable @typescript-eslint/adjacent-overload-signatures */
/* eslint-disable @typescript-eslint/ban-types */

import { Element, Node, Text } from '@xmldom/xmldom';
import type { X4EList } from './private/x4e-list';
import type { X4E } from './private/x4e-node';
import type { ConvertableTypes } from './private/x4e-utils';

interface X4ENodeProxy<TNode extends Node> {
    [child: number]: XML<TNode> | undefined;
    "*": XMLList<Node>;
}

interface X4EElementProxy {
    [child: string]: XMLList<Element>;
}

interface IXML<TNode extends Node> extends Omit<X4E<TNode>, keyof Function>, X4ENodeProxy<Node> {}
interface IXMLList<TNode extends Node> extends Omit<X4EList<TNode>, keyof Function>, X4ENodeProxy<TNode> {}

// XML

export type XML<TNode extends Node> = IXML<TNode> & X4EElementProxy;

export interface XMLConstructor {
    new (source?: null | undefined): XML<Text>;
        (source?: null | undefined): XML<Text>;

    new <TNode extends Node>(source: TNode | XML<TNode> | XMLList<TNode>): XML<TNode>;
        <TNode extends Node>(source: TNode | XML<TNode> | XMLList<TNode>): XML<TNode>;

    new <TNode extends Node = Node>(source: ConvertableTypes | null | undefined, defaultNamespace?: string): XML<TNode>;
        <TNode extends Node = Node>(source: ConvertableTypes | null | undefined, defaultNamespace?: string): XML<TNode>;
}

// XMList

export type XMLList<TNode extends Node> = IXMLList<TNode> & X4EElementProxy;

export interface XMLListConstructor {
    new <TNode extends Node>(source: TNode | ArrayLike<TNode> | XML<TNode> | XMLList<TNode>): XMLList<TNode>;
        <TNode extends Node>(source: TNode | ArrayLike<TNode> | XML<TNode> | XMLList<TNode>): XMLList<TNode>;

    new <TNode extends Node = Node>(source: ConvertableTypes | ArrayLike<Node> | null | undefined, defaultNamespace?: string): XMLList<TNode>;
        <TNode extends Node = Node>(source: ConvertableTypes | ArrayLike<Node> | null | undefined, defaultNamespace?: string): XMLList<TNode>;
}
