import { html, NS_XHTML, xhtml, XML, xml, XMLList } from '../src';

describe('x4e', () => {
    it('can create objects', () => {
        expect.assertions(4);

        const x = xml`<people class="example">
                <person id="1"><name>sam</name></person>
                <person id="2"><name>elizabeth</name></person>
            </people>`;

        expect(x instanceof XML).toBe(true);
        expect(x['person'][0]?.['name'].$toString()).toBe('sam');
        expect(x['person'][1]?.['name'].$toString()).toBe('elizabeth');
        expect(x['person'][2]?.['name'].$toString()).toBeUndefined()
    });

    it('can compare objects', () => {
        expect.assertions(15);

        const e1a = xml`<e1 a1a="attrib-1" a1b='0'>
                text child
                <!-- comment -->
                <?pi proc instruction ?>
                <p:e2 xmlns:p="foo:bar" p:a3="attrib-3"/>
            </e1>`;
        const e1b = xml`<e1 a1b="0" a1a='attrib-1'>
                text child
                <!-- comment -->
                <?pi proc instruction ?>
                <q:e2 q:a3="attrib-3" xmlns:q="foo:bar"/>
            </e1>`;

        expect(e1a.$isEqual(e1a)).toBe(true);
        expect(e1a.$isSame(e1a)).toBe(true);

        expect(e1a.$isEqual(e1b)).toBe(true);
        expect(e1a.$isSame(e1b)).toBe(false);

        expect(e1a == e1b).toBe(false);
        expect(e1a === e1b).toBe(false);

        expect(XMLList(e1a).$isEqual(e1b)).toBe(true);
        expect(e1b.$isEqual(XMLList(e1b))).toBe(true);
        expect(XMLList(e1a).$isEqual(XMLList(e1b))).toBe(true);

        expect(e1a.$attribute("a1b").$isEqual("0")).toBe(true);
        expect(e1a.$attribute("a1b").$isEqual(0)).toBe(true);

        const xmlDoc   = xml`<html a=""><head></head><body></body></html>`;
        const xhtmlDoc = xhtml`<html a=""><head></head><body></body></html>`;
        const xmlnsDoc = xml`<html xmlns="${NS_XHTML}" a=""><head></head><body></body></html>`;
        const htmlDoc  = html`<html a>`;

        expect(xmlDoc.$isEqual(htmlDoc)).toBe(false); // Because wrong namespace
        expect(xmlnsDoc.$isEqual(htmlDoc)).toBe(true);
        expect(xhtmlDoc.$isEqual(htmlDoc)).toBe(true);
        expect(htmlDoc.$isEqual(htmlDoc)).toBe(true);
    });
});
