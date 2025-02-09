import { Node } from '@xmldom/xmldom';
import { ToXMLList, X4EList } from './private/x4e-list';
import { ToXML, X4E } from './private/x4e-node';
import type { ConvertableTypes } from './private/x4e-utils';
import type { XML as _XML, XMLList as _XMLList, XMLConstructor, XMLListConstructor } from './x4e-types';

// § 13.4.1 / 13.4.2 (X4E: Explicit default namespace)
export type XML<TNode extends Node> = _XML<TNode>;
export const XML = function(this: XML<Node> | undefined, value?: ConvertableTypes | null | undefined, defaultNamespace = '') {
    return ToXML(value === null || value === undefined ? '' : value, defaultNamespace, this instanceof XML);
} as XMLConstructor;

XML.prototype = X4E.prototype;

// § 13.5.1 / 13.5.2 (X4E: Explicit default namespace)
export type XMLList<TNode extends Node> = _XMLList<TNode>;
export const XMLList = function(this: XMLList<Node> | undefined, value?: ConvertableTypes | ArrayLike<Node> | null | undefined, defaultNamespace: string = '') {
    return ToXMLList(value === null || value === undefined ? '' : value, defaultNamespace, this instanceof XMLList);
} as XMLListConstructor;

XMLList.prototype = X4EList.prototype;
