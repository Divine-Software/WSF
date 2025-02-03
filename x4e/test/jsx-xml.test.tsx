/** @jsx     jsx4XML.element */
/** @jsxFrag jsx4XML.fragment */

import { Node } from '@xmldom/xmldom';
import { jsx4XML, XMLList } from '../src';

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

        const Button = (prop: { value: string }, context: { color: string }) => (
            <null/>
        );

        function FComponent(props: FooProp) {
            return <hej class="hej" className="ho" class-name='hoho' undefined={false} null="true" data-hej="fie" />;
        }

        class CComponent{
            constructor(private props: { href?: string}, private children: XMLList<Node>) {

            }

            render() {
                return <><FComponent X={1} Y={2} name={this.props.href ?? 'hej'} /><olle/>{this.children}</>;
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

        // console.log(c, y, l, f);
        // console.log(x.person.name);
        // console.log(x.person[0]?.name);

        expect(true).toBe(true);
    });
});
