/* eslint-disable jest/no-if */
/* eslint-disable jest/no-conditional-expect */
/* eslint-disable jest/no-export */
import { DatabaseURI, DBQuery, FIELDS, q, URI, VOID } from '../../src';

export interface CommonDBTestParams {
    name:        string;
    uri:         URI;
    createDT:    DBQuery,
    enableDT:    EnabledDataTypes,
    schemaInfo:  boolean,
    returning:   boolean,
    rowKey:      boolean,
    selectCount: boolean,
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
            expect.assertions(14);

            await db.query`insert into ${q.quote('dt')} ${q.values({ text: '🐈 2', double: 10 })}`;
            const res = await db.query<(DataTypes[])>(
                q('insert into dt (text, "double") values ({t}, {d})', { t: '🐈 1', d: 11 }),
                q`update dt set "real" = "double" * 2 where "text" in ${q.list(['🐈 1', undefined, '🐈 2'])}`,
                q`select * from dt where ${q.join('or', ['🐈 1', '🐈 2'].map((t) => q`(${q.quote('text')} = ${t})`))} order by text`
            );

            expect(res[FIELDS]).toHaveLength(3);
            expect(res[FIELDS][0]).toHaveLength(0);
            expect(res[FIELDS][1]).toHaveLength(0);
            expect(res[FIELDS][2]).toHaveLength(2);

            expect(res[FIELDS][0].rowCount).toBe(1);
            expect(res[FIELDS][1].rowCount).toBe(2);
            expect(res[FIELDS][2].rowCount).toBe(def.selectCount ? 2 : undefined);

            expect(res).toHaveLength(2);
            expect(res[0].text).toBe('🐈 1');
            expect(res[0].real).toBe(22);
            expect(res[0].double).toBe(11);
            expect(res[1].text).toBe('🐈 2');
            expect(res[1].real).toBe(20);
            expect(res[1].double).toBe(10);
        });

        it('returns insert/update/delete metadata', async () => {
            expect.assertions(11);

            const { [FIELDS]: [ rs1 ] } = await db.query`insert into dt (text) values ('md1'), ('md2'), ('md3')`;

            const { [FIELDS]: [ rs2 ] } = def.returning
                ? db.protocol === 'sqlserver:' // SQL Server quirk
                    ? await db.query`insert into dt (text) output inserted.serial values ('md4')`
                    : await db.query`insert into dt (text) values ('md4') returning serial`
                : await db.query`insert into dt (text) values ('md4')`
            const serial = def.returning ? String(rs2[0][0]): rs2.rowKey!;

            const { [FIELDS]: [ rs3 ] } = await db.query`select serial, text from dt where serial=${serial}`;

            expect(rs1).toHaveLength(0);
            expect(rs1.rowCount).toBe(3);
            expect(typeof rs1.rowKey).toBe(def.rowKey ? 'string' : 'undefined');

            expect(rs2).toHaveLength(def.returning ? 1 : 0);
            expect(rs2.rowCount).toBe(db.protocol === 'sqlite:' ? undefined : 1); // SQLite quirk
            expect(typeof rs2.rowKey).toBe(def.rowKey && !def.returning ? 'string' : 'undefined');
            expect(typeof serial).toBe('string');

            expect(rs3).toHaveLength(1);
            expect(rs3.rowCount).toBe(def.selectCount ? 1 : undefined);
            expect(String(rs3[0][0])).toBe(serial);
            expect(rs3[0][1]).toBe('md4');
        });

        it('handles transactions', async () => {
            expect.assertions(10);

            await expect(db.query(async () => {
                await db.$`#dt`.append({ text: '🦮 1.1' });

                const t1a = await db.$`#dt(text);scalar?(eq,text,🦮 1.1)`.load();
                expect(t1a.valueOf()).toBe('🦮 1.1');

                throw new Error('Force failure');
            })).rejects.toThrow('Force failure');

            // Transaction #1 should be rolled back completely
            const t1b = await db.$`#dt(text);scalar?(eq,text,🦮 1.1)`.load();
            expect(t1b.valueOf()).toBe(VOID);

            const t2a = await db.query(async () => {
                await db.$`#dt`.append({ text: '🦮 2.1' });

                const t2b = await db.query(async () => {
                    await db.$`#dt`.append({ text: '🦮 2.2' });

                    const t2c = await db.query`select text from dt where text like ${'🦮 2.%'}`;
                    expect(t2c).toHaveLength(2);

                    await expect(db.query(async () => {
                        await db.$`#dt`.append({ text: '🦮 2.3' });

                        const t2d = await db.query`select text from dt where text like ${'🦮 2.%'}`;
                        expect(t2d).toHaveLength(3);

                        throw new Error('SP reject');
                    })).rejects.toThrow('SP reject')

                    return db.query`select text from dt where text like ${'🦮 2.%'}`;
                });

                expect(t2b).toHaveLength(2);

                return db.query`select text from dt where text like ${'🦮 2.%'}`;
            });

            // Only the last SP should be rolled back
            const t2e = await db.query`select text from dt where text like ${'🦮 2.%'}`;

            expect(t2a).toHaveLength(2);
            expect(t2e).toHaveLength(2);

            expect(t2a).toStrictEqual(t2e);
        });

        it('provides result set metadata', async () => {
            expect.assertions(26);

            await db.query(q`drop table if exists j`,
                           q`create table j (col integer)`,
                           q`insert into j values (10)`,
                           q`insert into dt (text, "int") values ('j', 10)`);

            const res = await db.query<{ text: string, first: number | bigint, second: number | bigint, now: Date }[]>`
                select text, main.int as first, joined.col as second, current_timestamp as now from dt as main
                inner join j as joined on joined.col = main.int
                where text = ${'j'}`;

            expect(res).toHaveLength(1);
            expect(res[0].text).toBe('j')
            expect(Number(res[0].first)).toBe(10)
            expect(Number(res[0].second)).toBe(10)
            def.enableDT.tstz ? expect(res[0].now).toBeInstanceOf(Date) : expect(typeof res[0].now).toBe('string');

            const { columns } = res[FIELDS][0];
            expect(columns).toHaveLength(4);

            expect(columns[0].label).toBe('text');
            expect(columns[1].label).toBe('first');
            expect(columns[2].label).toBe('second');
            expect(columns[3].label).toBe('now');

            expect(typeof columns[0].type_id).toBe('number');
            expect(typeof columns[1].type_id).toBe('number');
            expect(typeof columns[2].type_id).toBe('number');
            expect(typeof columns[3].type_id).toBe(db.protocol !== 'sqlite:' ? 'number' : 'undefined');

            await res[FIELDS][0].updateColumnInfo();

            expect(columns[0].table_name).toBe(def.schemaInfo ? 'dt' : undefined);
            expect(columns[1].table_name).toBe(def.schemaInfo ? 'dt' : undefined);
            expect(columns[2].table_name).toBe(def.schemaInfo ? 'j'  : undefined);
            expect(columns[3].table_name).toBeUndefined()

            expect(columns[0].column_name).toBe(def.schemaInfo ? 'text' : undefined);
            expect(columns[1].column_name).toBe(def.schemaInfo ? 'int'  : undefined);
            expect(columns[2].column_name).toBe(def.schemaInfo ? 'col'  : undefined);
            expect(columns[3].column_name).toBeUndefined()

            expect(typeof columns[0].data_type).toBe(def.schemaInfo ? 'string' : 'undefined');
            expect(typeof columns[1].data_type).toBe(def.schemaInfo ? 'string' : 'undefined');
            expect(typeof columns[2].data_type).toBe(def.schemaInfo ? 'string' : 'undefined');
            // `data_type` for non-table columns may or may not be available, so don't test

            expect(def.schemaInfo ? [columns[0].table_catalog, columns[0].table_schema] : [ '_divine_uri_test_' ]).toContain('_divine_uri_test_');
        });
    });
}
