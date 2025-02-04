/* eslint-disable @typescript-eslint/no-namespace */

import { DOMImplementation, Node } from '@xmldom/xmldom';
import { XML, XMLList } from './x4e';
import { NS_XHTML } from './xml-utils';

// § 8.3 XML Initialiser Input Elements (X4E: Not really)
// § 11.1.5 XMLList Initialiser (X4E: Not really)

// export const JSX_CHILDREN = Symbol('children');

type JSX_Element  = XML<Node> | XMLList<Node>;
type JSX_Text     = string | number | bigint | boolean;
type JSX_Children = Array<JSX_Element | JSX_Text>

// export interface JSX_Attributes extends Record<string, unknown>, JSX_AnyContent {}

export type JSX_Attributes      = Record<string, unknown>;
export type JSX_ComponentResult = JSX_Element | null | undefined;

// export interface JSX_AnyContent {
//     [JSX_CHILDREN]?: JSX_Element | JSX_Text | Array<JSX_Element | JSX_Text>;
// }

// export interface JSX_TextContent {
//     [JSX_CHILDREN]?: JSX_Text;
// }

// export interface JSX_ElementContent {
//     [JSX_CHILDREN]?: JSX_Element | Array<JSX_Element>;
// }

// export interface JSX_SingleElementContent {
//     [JSX_CHILDREN]?: JSX_Element;
// }

export interface JSX_FunctionComponent<T extends JSX_Attributes> {
    (props: T, children: XMLList<Node>): JSX_ComponentResult;
}

export interface JSX_ElementClassCtor<T extends JSX_Attributes> {
    new (props: T, children: XMLList<Node>): JSX_ElementClass;
}

export interface JSX_ElementClass {
    render(): JSX_ComponentResult;
}

function isElementClassCtor<T extends JSX_Attributes>(func: JSX_ElementClassCtor<T> | JSX_FunctionComponent<T>): func is JSX_ElementClassCtor<T> {
    return func.prototype?.constructor === func;
}

// @ts-expect-error: Argument of type 'null' is not assignable to parameter of type 'string'.ts(2345)
const jsxDoc = new DOMImplementation().createDocument(null, null, null);

const JSX_FRAGMENT = Symbol('fragment');

type JSX_TagName<T extends JSX_Attributes> = string | JSX_ElementClassCtor<T> | JSX_FunctionComponent<T> | typeof JSX_FRAGMENT;

export function createJSXElement<T extends JSX_Attributes>(tagName: JSX_TagName<T>, namespaceURI: string | null, props: T | null, ...children: JSX_Children): JSX_Element {
    if (typeof tagName === 'string') {
        const element = jsxDoc.createElementNS(namespaceURI, tagName);

        if (props) {
            for (const [name, value] of Object.entries(props)) {
                element.setAttribute(name, String(value));
            }
        }

        for (const child of children) {
            if (child instanceof XML) {
                child.$domNodeList().forEach((child) => element.appendChild(jsxDoc.importNode(child, true)));
            }
            else {
                element.appendChild(jsxDoc.createTextNode(String(child)));
            }
        }

        return XML(element);
    }

    const childList  = XMLList(children.flatMap((c) => c instanceof XML ? Array.from(c.$domNodeList()) : jsxDoc.createTextNode(String(c))));

    if (typeof tagName === 'function') {
        // const attributes = { ...props!, [JSX_CHILDREN]: children.length === 1 ? children[0] : children };
        const attributes = props ?? {} as T;

        let node = isElementClassCtor(tagName) ? new tagName(attributes, childList) : tagName(attributes, childList);

        if (node instanceof XML === false && typeof node?.render === 'function') {
            node = node.render();
        }

        if (node instanceof XML) {
            return node;
        }
        else if (!node) {
            return XMLList([]);
        }
        else {
            throw new TypeError(`${node} is not XML`);
        }
    }
    else if (tagName === JSX_FRAGMENT) {
        return childList;
    }
    else {
        throw new TypeError(`Cannot construct JSX element from ${tagName}`);
    }
}

export namespace jsx4XML {
    export function element<T extends JSX_Attributes>(tagName: JSX_TagName<T>, props: T | null, ...children: JSX_Children): JSX_Element {
        return createJSXElement(tagName, null, props, ...children);
    }

    export const fragment: typeof JSX_FRAGMENT = JSX_FRAGMENT;

    export namespace JSX {
        export type Element = JSX_Element;
        export type ElementClass = JSX_ElementClass;
        // export type ElementChildrenAttribute = JSX_AnyContent;

        export interface IntrinsicElements {
            [elementName: string]: JSX_Attributes;
        }
    }
}

export namespace jsx4HTML {
    export function element<T extends JSX_Attributes>(tagName: JSX_TagName<T>, props: T | null, ...children: JSX_Children): JSX_Element {
        return createJSXElement(tagName, NS_XHTML, props, ...children);
    }

    export const fragment: typeof JSX_FRAGMENT = JSX_FRAGMENT;

    export namespace JSX {
        export type Element = JSX_Element;
        export type ElementClass = JSX_ElementClass;
        // export type ElementChildrenAttribute = JSX_AnyContent;

        export interface IntrinsicElements {
            [elementName: string]: JSX_Attributes;
        }
    }
}
