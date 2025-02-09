/* eslint-disable jsdoc/check-tag-names */

/** @jsx     jsx4XML.element */
/** @jsxFrag jsx4XML.fragment */

import { Node } from '@xmldom/xmldom';
import { jsx4XML, XMLList } from '../src';

void jsx4XML;

describe('jsx', () => {
    it('works', () => {
        expect.assertions(1);

        interface FooProp {
            name: string;
            X: number;
            Y: number;
        }

        function ComponentFoo(prop: FooProp) {
            return <Button value={prop.name} />;
        }

        const Button = (_prop: { value: string }, _context: { color: string }) => (
            <null/>
        );

        function FComponent(_props: FooProp) {
            return <hej class="hej" className="ho" class-name='hoho' undefined={false} null="true" data-hej="fie" />;
        }

        class CComponent{
            constructor(private _props: { href?: string}, private _children: XMLList<Node>) {

            }

            render() {
                return <><FComponent X={1} Y={2} name={this._props.href ?? 'hej'} /><olle/>{this._children}</>;
            }
        }

        const Element = () => null;

        const f = <FComponent X={111} Y={222} name={globalThis.toString()}></FComponent>;
        const c = <CComponent><Button value="1"/></CComponent>;
        const l = <><ComponentFoo X={10} Y={22} name="33" /><Button value='hej'></Button></>;

        const x = <people>
                <person id="1"><name>sam</name></person>
                <person id="2"><name>elizabeth</name></person>
            </people>;

        const y = <deep>
            <Element foo="bar"/>
            {x}
            <deeper>{x}</deeper>
        </deep>

        void f, void c, void l, void x, void y;
        // console.log(c, y, l, f);
        // console.log(x.person.name);
        // console.log(x.person[0]?.name);

        expect(true).toBe(true);
    });
});
