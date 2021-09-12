/* eslint-disable jest/no-if */
/* eslint-disable jest/no-conditional-expect */
/* eslint-disable jest/no-export */
import { kill } from 'process';
import { __values } from 'tslib';
import { DatabaseURI, DBQuery, FIELDS, q, URI } from '../../src';

export interface CommonDBTestParams {
    name:      string;
    uri:       URI;
    createDT:  DBQuery,
    enableDT:  EnabledDataTypes
}

export interface DataTypes {
    serial:    bigint;
    uuid:      string;
    int:       number;
    bigint:    bigint;
    real:      number;
    double:    number;
    decimal:   string;
    bigints:   bigint[];
    words:     string[];
    text:      string;
    bin:       Buffer;
    ts:        Date;
    tstz:      Date;
    bool:      boolean;
    json:      object;
    null:      null;
}

export type EnabledDataTypes = Record<keyof DataTypes, boolean>

type Nullable<T> = { [P in keyof T]: null | T[P] }

export function describeCommonDBTest(def: CommonDBTestParams) {
    const columns: Nullable<DataTypes> = {
        serial:    BigInt(1),
        uuid:      '00000000-0000-0000-0000-000000000000',
        int:       1e6,
        bigint:    BigInt('99999999999999999'),
        real:      12345.6,
        double:    1234567890.123,
        decimal:   !def.enableDT.decimal ? null : '99999999999999999.99110',
        bigints:   !def.enableDT.bigints ? null : [ BigInt(10), BigInt(20), BigInt(30) ],
        words:     !def.enableDT.words   ? null : [ 'one', 'two' ],
        text:      'En 😀 täçkst',
        bin:       Buffer.of(1,2,3,4,127,128,254,255),
        ts:        new Date(),
        tstz:      new Date(),
        bool:      true,
        json:      { array: [ { object: null }, false, -10, '😀' ] },
        null:      null,
    };

    describe(`the ${def.name} driver`, () => {
        const db = def.uri as DatabaseURI;

        it('can manage schema', async () => {
            expect.assertions(1);

            await db.query`drop table if exists dt`;
            await db.query(def.createDT);
            expect(1).toBe(1);
        });

        it('inserts and selects all supported datatypes', async () => {
            expect.assertions(16);

            const values = def.enableDT.serial ? { ...columns, serial: undefined } : columns;
            await db.query`insert into dt ${q.values(values)}`;

            const res = await db.query<DataTypes[]>`select * from dt`;
            expect(res).toHaveLength(1);

            def.enableDT.serial ?
                expect(res[0].serial).toBeGreaterThan(BigInt(0)) :
                expect(res[0].serial).toBe(columns.serial);
            expect(res[0].uuid      ).toBe(columns.uuid);
            expect(res[0].int       ).toBe(def.enableDT.int ? columns.int : BigInt(columns.int!));
            expect(res[0].bigint    ).toBe(columns.bigint);
            expect(res[0].real      ).toBeCloseTo(columns.real!, 1);
            expect(res[0].double    ).toBeCloseTo(columns.double!, 3);
            expect(res[0].decimal   ).toBe(columns.decimal);
            expect(res[0].bigints   ).toStrictEqual(columns.bigints);
            expect(res[0].words     ).toStrictEqual(columns.words);
            expect(res[0].text      ).toBe(columns.text);
            expect(res[0].bin       ).toStrictEqual(columns.bin);
            expect(res[0].ts        ).toStrictEqual(def.enableDT.ts   ? columns.ts   : columns.ts?.toISOString() );
            expect(res[0].tstz      ).toStrictEqual(def.enableDT.tstz ? columns.tstz : columns.tstz?.toISOString() );
            expect(res[0].bool      ).toBe(def.enableDT.bool ? columns.bool : def.enableDT.int ? Number(columns.bool) : BigInt(columns.bool!));
            expect(res[0].json      ).toStrictEqual(def.enableDT.json ? columns.json : JSON.stringify(columns.json));
        });

        it('builds and executes queries', async () => {
            expect.assertions(11);

            await db.query`insert into ${q.quote('dt')} ${q.values({text: 'q2', double: 10})}`;
            const res = await db.query<(DataTypes[])>(
                q`insert into dt (text, "double") values ('q1', 11)`,
                q`update dt set "real" = "double" * 2 where "text" in ('q1', 'q2')`,
                q`select * from dt where ${q.join('or', ['q1', 'q2'].map((t) => q`(${q.quote('text')} = ${t})`))} order by text`
            );

            expect(res[FIELDS]).toHaveLength(3)
            expect(res[FIELDS][0]).toHaveLength(0)
            expect(res[FIELDS][1]).toHaveLength(0)
            expect(res[FIELDS][2]).toHaveLength(2)

            expect(res).toHaveLength(2);
            expect(res[0].text).toBe('q1');
            expect(res[0].real).toBe(22);
            expect(res[0].double).toBe(11);
            expect(res[1].text).toBe('q2');
            expect(res[1].real).toBe(20);
            expect(res[1].double).toBe(10);
        });
    });
}
