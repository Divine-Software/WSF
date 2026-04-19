/* eslint-disable jest/no-conditional-expect */
/* eslint-disable jest/no-export */
/* eslint-disable jest/no-standalone-expect */
/* eslint-disable jsdoc/require-jsdoc */

import { createHash } from 'crypto';
import { DatabaseURI, DBError, DBParamsSelector, DBQuery, dbRef, FIELDS, q, unwrap, URI, wrap } from '../../src';
import { DBDataTable, DT_METADATA, DTError, DTRecordMetadata, DTTableMetadata, noAuth, Precondition } from '../../src/datatable';

export interface CommonDBTestParams {
    name:        string;
    uri:         URI;
    createDT:    DBQuery | DBQuery[];
    enableDT:    EnabledDataTypes;
    isolation:   DBQuery;
    schemaInfo:  boolean;
    returning:   boolean;
    rowKey:      boolean;
    comments:    boolean;
    upsert:      'no' | 'with-key' | 'without-key' | 'yes';
    defaultVal:  boolean;
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

interface CDTEntity {
    date?: string | null;
    req:   string;
    opt?:  string;
}

interface CDTTable {
    id:    string;
    date:  string | null;
    req:   string;
    opt?:  string;
}

class CommonDataTable extends DBDataTable<string, CDTEntity, CDTTable> {
    public tableMetadataStatus: boolean | undefined;

    constructor(private _def: CommonDBTestParams, db: DatabaseURI, table: string, pk: keyof CDTTable) {
        super(db, table, pk);
    }

    protected override makeRecord(key: string | null, current: Readonly<CDTTable> | null, entity: CDTEntity | CDTTable): CDTTable {
        (entity as CDTTable).id = key ?? String(Date.now() + Math.random());

        if (entity.date === undefined) {
            entity.date = new Date().toISOString();
        }

        if (!this._def.defaultVal && entity.opt === undefined) {
            entity.opt = 'Def';
        }

        return entity as CDTTable;
    }

    protected override async recordMetadata(record: Readonly<CDTTable>): Promise<DTRecordMetadata> {
        return {
            version:   createHash('sha256').update(JSON.stringify(record)).digest('hex'),
            timestamp: record.date ? new Date(record.date) : undefined,
        };
    }

    protected override async tableMetadata(): Promise<DTTableMetadata> {
        if (this.tableMetadataStatus === true) {
            return {
                version:   createHash('sha256').update(JSON.stringify(await this._db.query`select * from "dv"`)).digest('hex'),
                timestamp: new Date((await this._db.query<any>`select max("date") as "max_date" from "dv"`)[0].max_date),
            };
        } else if (this.tableMetadataStatus === false) {
            return {
                version:   null,       // Not present
                timestamp: undefined,  // Resource has no timestamp
            };
        } else {
            return {};
        }
    }
}

export function describeCommonDBTest(def: CommonDBTestParams): void {
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

    function defined<T>(_obj: T): T {
        const obj: any = _obj;

        for (const k of Object.keys(obj)) {
            if (obj[k] === undefined) {
                delete obj[k];
            }
        }

        return obj;
    }

    describe(`the ${def.name} driver`, () => {
        const db = def.uri.addSelector<DBParamsSelector>({ params: {
            dbRefExtensionHandler(table, fn, args) {
                if (table.join('.') === 'dt' && fn === 'get' && args.length === 1) {
                    return q`text = ${args[0]}`;
                } else {
                    return undefined;
                }
            }
        }}, true) as DatabaseURI;

        let hasTC = false;

        jest.setTimeout(15000);

        beforeAll(async () => {
            await db.query(
                q`drop table if exists "dt"`,
                q`drop table if exists "dv"`,
                q`drop table if exists "j"`,
                q`drop table if exists "d"`,
                q`create table "dv" ("id" varchar(24) primary key not null, "date" char(24), "req" varchar(12) not null, "opt" varchar(12) default 'Def')`,
                q`create table "j" ("col" integer)`,
                q`create table "d" ("key" integer primary key not null, "def" varchar(10) default 'Def')`,
                ...[def.createDT].flat(),
            );

            hasTC = db.protocol !== 'mysql:' || parseFloat((await db.query<any>`select version()`)[0].version) >= 8;
        });

        afterAll(async () => {
            await db.close();
        });

        it('inserts and selects all supported datatypes', async () => {
            expect.assertions(16);

            const values = def.enableDT.serial ? defined({ ...columns, serial: undefined }) : columns;
            await db.query`insert into "dt" ${q.values(values)}`;

            const res = await db.query<DataTypes[]>`select * from "dt"`;
            expect(res).toHaveLength(1);

            def.enableDT.serial ?
                expect(res[0].serial).toBeGreaterThan(BigInt(0)) :
                expect(res[0].serial).toBe(columns.serial);
            expect(res[0].uuid      ).toBe(columns.uuid);
            expect(res[0].int       ).toBe(def.enableDT.int ? columns.int : BigInt(columns.int!));
            expect(res[0].bigint    ).toBe(def.enableDT.bigint ? columns.bigint : Number(columns.bigint));
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
                q('insert into "dt" ("text", "double") values ({t}, {d})', { t: '🐈 1', d: 11 }),
                q`update "dt" set "real" = "double" * 2 where "text" in ${q.list(['🐈 1', undefined, '🐈 2'])}`,
                q`select * from "dt" where ${q.join('or', ['🐈 1', '🐈 2'].map((t) => q`(${q.quote('text')} = ${t})`))} order by "text"`
            );

            expect(res[FIELDS]).toHaveLength(3);
            expect(res[FIELDS][0]).toHaveLength(0);
            expect(res[FIELDS][1]).toHaveLength(0);
            expect(res[FIELDS][2]).toHaveLength(2);

            expect(res[FIELDS][0].rowCount).toBe(1);
            expect(res[FIELDS][1].rowCount).toBe(2);
            expect(res[FIELDS][2].rowCount).toBe(2);

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

            const { [FIELDS]: [ rs1 ] } = await db.query`insert into "dt" ("text") values ('md1'), ('md2'), ('md3')`;

            const { [FIELDS]: [ rs2 ] } = def.returning
                ? db.protocol === 'sqlserver:' // SQL Server quirk
                    ? await db.query`insert into "dt" ("text") output "inserted"."serial" values ('md4')`
                    : await db.query`insert into "dt" ("text") values ('md4') returning "serial"`
                : await db.query`insert into "dt" ("text") values ('md4')`
            const serial = def.returning ? String(rs2[0][0]): rs2.rowKey!;

            const { [FIELDS]: [ rs3 ] } = await db.query`select "serial", "text" from "dt" where "serial"=${serial}`;

            expect(rs1).toHaveLength(0);
            expect(rs1.rowCount).toBe(3);
            expect(typeof rs1.rowKey).toBe(def.rowKey ? 'string' : 'undefined');

            expect(rs2).toHaveLength(def.returning ? 1 : 0);
            expect(rs2.rowCount).toBe(1);
            expect(typeof rs2.rowKey).toBe(def.rowKey && !def.returning ? 'string' : 'undefined');
            expect(typeof serial).toBe('string');

            expect(rs3).toHaveLength(1);
            expect(rs3.rowCount).toBe(1);
            expect(String(rs3[0][0])).toBe(serial);
            expect(rs3[0][1]).toBe('md4');
        });

        it('provides result set metadata', async () => {
            expect.assertions(27);

            await db.query(q`insert into "j" values (10)`,
                           q`insert into "dt" ("text", "int") values ('j', 10)`);

            const res = await db.query<{ text: string, first: number | bigint, second: number | bigint, now: Date }[]>`
                select "text", "main"."int" as "first", "joined"."col" as "second", current_timestamp as "now" from "dt" as "main"
                inner join "j" as "joined" on "joined"."col" = "main"."int"
                where "text" = ${'j'}`;

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

            const h2 = db.pathname.startsWith('h2:'); // H2 quirk
            expect(typeof columns[0].data_type).toBe(def.schemaInfo ? 'string' : 'undefined');
            expect(typeof columns[1].data_type).toBe(def.schemaInfo && !h2 ? 'string' : 'undefined');
            expect(typeof columns[2].data_type).toBe(def.schemaInfo && !h2 ? 'string' : 'undefined');
            // `data_type` for non-table columns may or may not be available, so don't test

            expect(columns[0].column_comment?.replace(/'/g, '')).toBe(def.comments ? 'This is plain text' : undefined);

            expect(def.schemaInfo
                ? [columns[0].table_catalog?.toLocaleLowerCase(), columns[0].table_schema?.toLocaleLowerCase()]
                : [ '_divine_uri_test_' ]
            ).toContain('_divine_uri_test_');
        });

        it('handles transactions', async () => {
            expect.assertions(14);

            await expect(db.query(async () => {
                await db.$`#dt`.append({ text: '🦮 1.1' });

                const t1a = await db.$`#dt(text);scalar?{eq,text,🦮 1.1}`.load();
                expect(t1a).toBeInstanceOf(String);
                expect(t1a.valueOf()).toBe('🦮 1.1');

                throw new SyntaxError('Force failure');
            })).rejects.toThrow(SyntaxError);

            await expect(db.query(null!)).rejects.toThrow('Invalid query() arguments'); // Should throw async

            // Transaction #1 should be rolled back completely
            const t1b = await db.$`#dt(text);scalar?{eq,text,🦮 1.1}`.load();
            expect(t1b).toStrictEqual(wrap(undefined));
            expect(t1b.valueOf()).toBe(undefined);
            expect(unwrap(t1b)).toBe(undefined);

            const t2a = await db.query(async () => {
                await db.$`#dt`.append({ text: '🦮 2.1' });

                const t2b = await db.query(async () => {
                    await db.$`#dt`.append({ text: '🦮 2.2' });

                    const t2c = await db.query`select "text" from "dt" where "text" like ${'🦮 2.%'}`;
                    expect(t2c).toHaveLength(2);

                    await expect(db.query(async () => {
                        await db.$`#dt`.append({ text: '🦮 2.3' });

                        const t2d = await db.query`select "text" from "dt" where "text" like ${'🦮 2.%'}`;
                        expect(t2d).toHaveLength(3);

                        throw new Error('SP reject');
                    })).rejects.toThrow('SP reject')

                    return db.query`select "text" from "dt" where "text" like ${'🦮 2.%'}`;
                });

                expect(t2b).toHaveLength(2);

                return db.query`select "text" from "dt" where "text" like ${'🦮 2.%'}`;
            });

            // Only the last SP should be rolled back
            const t2e = await db.query`select "text" from "dt" where "text" like ${'🦮 2.%'}`;

            expect(t2a).toHaveLength(2);
            expect(t2e).toHaveLength(2);

            expect(t2a).toStrictEqual(t2e);
        });

        it('recovers automatically from transaction deadlocks', async () => {
            expect.assertions(4);
            jest.setTimeout(30_000);

            let currentStep = 1;
            const step = async (current: number) => {
                while (currentStep < current) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                if (currentStep === current) {
                    ++currentStep;
                }
            }

            await db.$`#dt`.append({ text: 'rowlock', real: 110 });
            await db.$`#j`.append({ col: 110 });

            let maxRetries = 0, start = 0, end = 0;

            const t1 = db.query({ options: def.isolation }, async (retry) => {
                maxRetries = Math.max(retry!);
                ++start;

                try {
                    await db.$`#dt?{eq,text,rowlock}&lock=write`.load();
                }
                finally {
                    await step(1);
                }

                await step(4);

                return db.query(async () => { // Ensure lock errors propagates savepoints too
                    const update = db.query`update "j" set "col" = "col" + 2 where "col" = 110 or "col" = 111`;

                    try {
                        await Promise.race([ update, new Promise((resolve) => setTimeout(resolve, 1000)) ]);
                    }
                    finally {
                        await step(5); // Allow t2 to continue
                    }

                    await update;
                    ++end;
                });
            });

            const t2 = db.query({ options: def.isolation }, async (retry) => {
                ++start;
                maxRetries = Math.max(retry!);

                await step(2);

                try {
                    await db.query`update "j" set "col" = "col" + 1 where "col" = 110 or "col" = 112`;
                }
                finally {
                    await step(3); // Allow t1 to continue
                }

                return db.query(async () => { // Ensure lock errors propagates savepoints too
                    await step(6);
                    await db.query`update "dt" set "real" = "real" + 1 where "text" = 'rowlock'`;
                    ++end;
                });
            });

            await Promise.all([t1, t2]);
            const col = await db.$`#j(col);scalar?{eq,col,113}`.load();

            expect(maxRetries).toBeGreaterThanOrEqual(1);
            expect(start).toBeGreaterThanOrEqual(3);
            expect(end).toBe(2);
            expect(Number(col)).toBe(113);
        });

        it('parses and executes common DB references', async () => {
            expect.assertions(26);

            const a1 = await db.$`#dt`.append<DataTypes | undefined> ({ text: 'dbref1' });
            const a2 = await db.$`#dt`.append<DataTypes[]>([{ text: 'dbref2' }, { text: 'dbref3' }]);
            const k1 = a1[FIELDS][0].rowKey ?? unwrap(a1)?.serial;
            const k2 = a2[FIELDS][0].rowKey ?? a2[0]?.serial;

            expect(k1).toBeDefined();
            expect(k2).toBeDefined();
            expect(a1).toMatchObject(def.returning ? { serial: k1, text: 'dbref1' } : wrap(undefined));
            expect(a2).toHaveLength(def.returning ? 2 : 0);
            expect(a1[FIELDS][0].rowCount).toBe(1);
            expect(a2[FIELDS][0].rowCount).toBe(2);

            await expect(db.$`#dt`.remove()).rejects.toThrow('A filter is required to this query');

            const r1 = await db.$`#dt?{eq,serial,${k1}}`.remove();
            const r2 = await db.$`#dt?{eq,text,dbref2}`.remove();

            expect(r1[FIELDS][0].rowCount).toBe(1);
            expect(r2[FIELDS][0].rowCount).toBe(1);

            await expect(db.$`#dt`.modify({})).rejects.toThrow('A filter is required to this query');

            const u1 = await db.$`#dt?{eq,text,dbref3}`.modify({ text: 'dbref3b', real: 1337 });

            expect(u1[FIELDS][0].rowCount).toBe(1);
            expect(u1).toHaveLength(0);

            const l1 = await db.$`#dt(real);scalar?{eq,text,dbref3b}`.load();
            const l2 = await db.$`#dt;one?{and{gt,text,dbref}{lt,text,dbref9}}`.load<DataTypes>();
            const l3 = await db.$`#dt?{eq,real,${l1}}`.load<DataTypes[]>();

            expect(l1.valueOf()).toBe(1337);
            expect(l2.real.valueOf()).toBe(1337);
            expect(l3[0].real.valueOf()).toBe(1337);
            expect(l3).toHaveLength(1);
            expect(l1[FIELDS][0][0][0]).toBe(1337);
            expect(l2[FIELDS][0][0][4]).toBe(1337);
            expect(l3[FIELDS][0][0][4]).toBe(1337);

            await db.$`#dt`.append([{ text: 'dbref4' }, { text: 'dbref5' }]);

            const l4 = await db.$`#dt?{in,text,}`.load<DataTypes[]>();
            const l5 = await db.$`#dt?{in,text,dbref4,dbref3b}`.load<DataTypes[]>();
            const l6 = await db.$`#dt?{and{gt,text,dbref}{lt,text,dbref9}{null,real}}`.load<DataTypes>();
            const l7 = await db.$`#dt?{and{gt,text,dbref}{lt,text,dbref9}{not{null,real}}}`.load<DataTypes>();

            expect(l4).toHaveLength(0);
            expect(l5).toHaveLength(2);
            expect(l6).toHaveLength(2);
            expect(l7).toHaveLength(1);

            await expect(db.$`#dt?{missing-func[]}`.load()).rejects.toThrow(`Unknown filter function 'missing-func'.`);

            const l8 = await db.$`#dt?{get[dbref4]}`.load<DataTypes[]>();

            expect(l8).toHaveLength(1);
            expect(l8[0].text).toBe('dbref4');
        });

        it('parses and executes load() DB references', async () => {
            expect.assertions(12);

            await db.$`#dt`.append([
                { text: 'dbref-load', real: 2 },
                { text: 'dbref-load', real: 1 },
                { text: 'dbref-load', real: 4 },
                { text: 'dbref-load', real: 5 },
                { text: 'dbref-load', real: 3 },
                { text: 'dbref-load', real: 5 },
            ]);

            const l1 = await db.$`#dt`.load<DataTypes[]>();
            const l2 = await db.$`#dt(real,text);unique`.load<DataTypes[]>();
            const l3 = await db.$`#dt(real)?{eq,text,dbref-load}&order=real`.load<DataTypes[]>();
            const l4 = await db.$`#dt(real)?{eq,text,dbref-load}&order=-real`.load<DataTypes[]>();
            const l5 = await db.$`#dt(real)?{eq,text,dbref-load}&order=real&limit=2`.load<DataTypes[]>();
            const l6 = await db.$`#dt(real)?{eq,text,dbref-load}&order=real&offset=2`.load<DataTypes[]>();
            const l7 = await db.$`#dt(real)?{eq,text,dbref-load}&order=real&offset=3&limit=2`.load<DataTypes[]>();

            expect(l1.filter((r) => r.text === 'dbref-load')).toHaveLength(6);
            expect(l2.filter((r) => r.text === 'dbref-load')).toHaveLength(5);
            expect([...l3]).toStrictEqual([{ real: 1 }, { real: 2 }, { real: 3 }, { real: 4 }, { real: 5 }, { real: 5 } ]);
            expect([...l4]).toStrictEqual([{ real: 1 }, { real: 2 }, { real: 3 }, { real: 4 }, { real: 5 }, { real: 5 } ].reverse());
            expect([...l5]).toStrictEqual([{ real: 1 }, { real: 2 } ]);
            expect([...l6]).toStrictEqual([{ real: 3 }, { real: 4 }, { real: 5 }, { real: 5 } ]);
            expect([...l7]).toStrictEqual([{ real: 4 }, { real: 5 } ]);

            expect(l3[FIELDS][0].totalCount).toBe(hasTC ? 6 : undefined);
            expect(l4[FIELDS][0].totalCount).toBe(hasTC ? 6 : undefined);
            expect(l5[FIELDS][0].totalCount).toBe(hasTC ? 6 : undefined);
            expect(l6[FIELDS][0].totalCount).toBe(hasTC ? 6 : undefined);
            expect(l7[FIELDS][0].totalCount).toBe(hasTC ? 6 : undefined);
        });

        (def.upsert === 'no' ? it.skip : it)('parses and executes save() DB references', async () => {
            expect.assertions(def.upsert === 'no' ? 0 : 10);

            const db1 = def.upsert !== 'with-key'    ? db.$`#dt` : db.$`#dt[serial]`;
            const db2 = def.upsert !== 'without-key' ? db.$`#dt[serial]` : db.$`#dt`;

            const i1 = db.pathname.startsWith('h2:') ? { serial: 98 } : undefined; // H2 quirk
            const i2 = db.pathname.startsWith('h2:') ? { serial: 99 } : undefined; // H2 quirk
            const s1 = await db1.save<DataTypes>({ ...i1, text: 'dbref-save 1', real: 1 });
            const s2 = await db2.save<DataTypes[]>([{ ...i2, text: 'dbref-save 2', real: 2 }]);
            const k1 = String(s1[FIELDS][0].rowKey ?? unwrap(s1)?.serial ?? i1?.serial);
            const k2 = String(s2[FIELDS][0].rowKey ?? s2[0]?.serial ?? i2?.serial);
            const u1 = await db2.save<DataTypes[]>({ serial: k1, real: 3 });
            const u2 = await db1.save<DataTypes[]>({ serial: k2, real: 4 });

            expect(s1[FIELDS][0].rowCount).toBe(1);
            expect(s2[FIELDS][0].rowCount).toBe(1);
            expect(u1[FIELDS][0].rowCount).toBe(1);
            expect(u2[FIELDS][0].rowCount).toBe(1);

            const l1 = await db.$`#dt;one?{eq,serial,${k1}}`.load<DataTypes>();
            const l2 = await db.$`#dt;one?{or{eq,serial,${k1}}{eq,serial,${k2}}}&order=-text&limit=1`.load<DataTypes>();

            expect(String(l1.serial)).toBe(k1);
            expect(String(l2.serial)).toBe(k2);
            expect(l1.text).toBe('dbref-save 1');
            expect(l2.text).toBe('dbref-save 2');
            expect(l1.real).toBe(3);
            expect(l2.real).toBe(4);
        });

        (def.defaultVal ? it : it.skip)('inserts defaults for undefined values', async () => {
            expect.assertions(4);
            const keyedUpsert = [ 'yes', 'with-key' ].includes(def.upsert);
            const primeUpsert = [ 'yes', 'without-key' ].includes(def.upsert);

            await db.query`insert into "d" ${q.values([{ key: 100 }, { key: 101, def: undefined }, { key: 102, def: null }])}`;
            await db.$`#d`.append(                    [{ key: 110 }, { key: 111, def: undefined }, { key: 112, def: null }]);
            keyedUpsert && await db.$`#d[key]`.save(  [{ key: 120 }, { key: 121, def: undefined }, { key: 122, def: null }]);
            primeUpsert && await db.$`#d`.save(       [{ key: 130 }, { key: 131, def: undefined }, { key: 132, def: null }]);

            const r1 = await db.query<any[]>`select * from "d" where "key" between 100 and 1000 order by "key"`;
            const v1 = Object.fromEntries(r1.map((r) => [ r.key, String(r.def) ]));
            expect(r1).toHaveLength(6 + (keyedUpsert ? 3 : 0) + (primeUpsert ? 3 : 0));
            expect(v1).toMatchObject({
                                    '100': 'Def', '101': 'Def', '102': 'null',
                                    '110': 'Def', '111': 'Def', '112': 'null',
                ...(keyedUpsert ? { '120': 'Def', '121': 'Def', '122': 'null' } : {}),
                ...(primeUpsert ? { '130': 'Def', '131': 'Def', '132': 'null' } : {}),
            });

            await db.query`update "d" set ${q.assign({ def: null })} where "key" = 101`;
            await db.query`update "d" set ${q.assign({ def: undefined })} where "key" = 102`;
            await db.$`#d?{eq,key,111}`.modify({ def: null });
            await db.$`#d(def)?{eq,key,112}`.modify({});
            keyedUpsert && await db.$`#d[key]`.save([{ key: 121, def: null }, { key: 122, def: undefined }]);
            primeUpsert && await db.$`#d`.save([{ key: 131, def: null }, { key: 132, def: undefined }]);

            const Def = db.pathname.startsWith('h2:') ? 'null' : 'Def'; // h2database/h2database#3183

            const r2 = await db.query<any[]>`select * from "d" where "key" between 100 and 1000 order by "key"`;
            const v2 = Object.fromEntries(r2.map((r) => [ r.key, String(r.def) ]));
            expect(r2).toHaveLength(6 + (keyedUpsert ? 3 : 0) + (primeUpsert ? 3 : 0));
            expect(v2).toMatchObject({
                                    '100': 'Def', '101': 'null', '102': 'Def',
                                    '110': 'Def', '111': 'null', '112': 'Def',
                ...(keyedUpsert ? { '120': 'Def', '121': 'null', '122':  Def } : {}),
                ...(primeUpsert ? { '130': 'Def', '131': 'null', '132':  Def } : {}),
            });
        });

        it('handles basic DataTable entity ops', async () => {
            expect.assertions(33);

            const dv = new CommonDataTable(def, db, 'dv', 'id');

            await expect(dv.load(noAuth, 'entity')).rejects.toThrow(DTError);
            await expect(dv.load(noAuth, 'entity')).rejects.toThrow('not-found');

            const s1 = await dv.save(noAuth, 'entity', { req: 'req1', opt: 'opt1' });
            expect(s1).toStrictEqual({ id: 'entity', date: expect.any(String), req: 'req1', opt: 'opt1' });
            expect(s1[DT_METADATA].timestamp).toBeInstanceOf(Date);
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s1);

            const s2 = await dv.save(noAuth, 'entity', { req: 'req2', opt: 'opt2' });
            expect(s2).toStrictEqual({ id: 'entity', date: expect.any(String), req: 'req2', opt: 'opt2' });
            expect(s2[DT_METADATA].timestamp).toBeInstanceOf(Date);
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s2);

            const s3 = await dv.save(noAuth, 'entity', { req: 'req3', date: new Date(0).toISOString() });
            expect(s3).toStrictEqual({ id: 'entity', date: '1970-01-01T00:00:00.000Z', req: 'req3', opt: 'Def' });
            expect(s3[DT_METADATA].timestamp).toStrictEqual(new Date(0));
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s3);

            const s4 = dv.save(noAuth, 'entity', {} as CDTEntity);
            await expect(s4).rejects.toBeInstanceOf(DBError);
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s3);

            const s5 = dv.save(noAuth, 'entity', { req: 'req5', unknown: 'value' } as CDTEntity);
            await expect(s5).rejects.toBeInstanceOf(DBError);
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s3);

            const s6 = await dv.save(noAuth, 'entity', { id: 'ignored', date: null, req: 'req6' } as CDTEntity);
            expect(s6).toStrictEqual({ id: 'entity', date: null, req: 'req6', opt: 'Def' });
            expect(s6[DT_METADATA].timestamp).toBeUndefined();
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(s6);

            const m1 = await dv.modify(noAuth, 'entity', { id: 'ignored', date: undefined, req: 'req1', opt: 'opt1' } as Partial<CDTEntity>);
            expect(m1).toStrictEqual({ id: 'entity', date: expect.any(String), req: 'req1', opt: 'opt1' });
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(m1);

            const m2 = await dv.modify(noAuth, 'entity', { id: undefined, date: null, opt: undefined } as Partial<CDTEntity>);
            expect(m2).toStrictEqual({ id: 'entity', date: null, req: 'req1', opt: 'Def' });
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(m2);

            const m3 = await dv.modify(noAuth, 'entity', async (row) => ({ ...row, date: new Date(0).toISOString(), req: row.req + '*', opt: undefined }));
            expect(m3).toStrictEqual({ id: 'entity', date: '1970-01-01T00:00:00.000Z', req: 'req1*', opt: 'Def' });
            expect(m3[DT_METADATA].timestamp).toStrictEqual(new Date(0));
            expect(await dv.load(noAuth, 'entity')).toStrictEqual(m3);

            const m4 = dv.modify(noAuth, 'unknown', { req: 'req4' });
            await expect(m4).rejects.toThrow('not-found');

            const r1 = await dv.remove(noAuth, 'entity');
            expect(r1).toStrictEqual(wrap(null));
            expect(unwrap(r1)).toBeNull();
            expect(r1[DT_METADATA].version).toBeNull();
            expect(r1[DT_METADATA].timestamp).toBeUndefined();
            await expect(dv.load(noAuth, 'entity')).rejects.toThrow('not-found');

            const r2 = dv.remove(noAuth, 'entity');
            await expect(r2).rejects.toThrow('not-found');
            await expect(dv.load(noAuth, 'entity')).rejects.toThrow('not-found');
        });

        it('handles basic DataTable list ops', async () => {
            expect.assertions(32);

            const dv = new CommonDataTable(def, db, 'dv', 'id');

            const i1 = await dv.info();
            expect(i1).toStrictEqual(wrap(undefined));
            expect(i1[DT_METADATA].version).toBeUndefined();
            expect(i1[DT_METADATA].timestamp).toBeUndefined();

            dv.tableMetadataStatus = false;

            const i2 = await dv.info();
            expect(i2).toStrictEqual(wrap(undefined));
            expect(i2[DT_METADATA].version).toBeNull();
            expect(i2[DT_METADATA].timestamp).toBeUndefined();

            const l1 = await dv.list(noAuth);
            expect(l1).toHaveLength(0);
            expect(l1[DT_METADATA].version).toBeNull();
            expect(l1[DT_METADATA].timestamp).toBeUndefined();

            const a1 = await dv.append(noAuth, { req: 'list1' });
            expect(a1).toStrictEqual({ id: expect.any(String), req: 'list1', date: expect.any(String), opt: 'Def' })

            const a2 = await dv.append(noAuth, { id: 'ignored', req: 'list2', date: null, opt: 'opt2' } as CDTEntity);
            expect(a2).toStrictEqual({ id: expect.any(String), req: 'list2', date: null, opt: 'opt2' })
            expect(a2.id).not.toBe('ignored');

            await Promise.all(Array(7).fill(0).map((_, i) => dv.append(noAuth, { req: 'list' + (i + 3) })));

            const l2 = await dv.list(noAuth, { order: 'req' });
            expect(l2).toHaveLength(9);
            expect(l2[0]).toStrictEqual(a1);
            expect(l2[1]).toStrictEqual(a2);
            expect(l2[DT_METADATA].totalCount).toBe(hasTC ? 9 : undefined);

            const l3 = await dv.list(noAuth, { order: '-req' });
            expect(l3).toHaveLength(9);
            expect(l3[8]).toStrictEqual(a1);
            expect(l3[7]).toStrictEqual(a2);
            expect(l3[DT_METADATA].totalCount).toBe(hasTC ? 9 : undefined);

            const l4 = await dv.list(noAuth, { order: 'req', limit: 2 });
            expect(l4).toHaveLength(2);
            expect(l4[0]).toStrictEqual(a1);
            expect(l4[1]).toStrictEqual(a2);
            expect(l4[DT_METADATA].totalCount).toBe(hasTC ? 9 : undefined);

            const l5 = await dv.list(noAuth, { order: 'req', limit: 2, offset: 1 });
            expect(l5).toHaveLength(2);
            expect(l5[0]).toStrictEqual(a2);
            expect(l5[1].req).toBe('list3');
            expect(l5[DT_METADATA].totalCount).toBe(hasTC ? 9 : undefined);

            const l6 = await dv.list(noAuth, { order: 'req', limit: 2, offset: 3, where: dbRef('gt', 'req', 'list4') });
            expect(l6).toHaveLength(2);
            expect(l6[0].req).toBe('list8');
            expect(l6[1].req).toBe('list9');
            expect(l6[DT_METADATA].totalCount).toBe(hasTC ? 5 : undefined);
        });

        it('handles conditional DataTable entity ops', async () => {
            expect.assertions(12);

            const dv = new CommonDataTable(def, db, 'dv', 'id');

            await expect(dv.save(noAuth,   'cond-entity', { req: 'cond-entity' }, new Precondition('present'))).rejects.toThrow('precondition-failed');
            await expect(dv.modify(noAuth, 'cond-entity', { req: 'cond-entity' }, new Precondition('present'))).rejects.toThrow('precondition-failed');
            await expect(dv.remove(noAuth, 'cond-entity', new Precondition('present'))).rejects.toThrow('precondition-failed');

            const e1 = await dv.save(noAuth, 'cond-entity', { req: 'cond-entity' }, new Precondition('absent'));

            await expect(dv.save(noAuth,   'cond-entity', { req: 'cond-entity' }, new Precondition('absent'))).rejects.toThrow('precondition-failed');
            await expect(dv.modify(noAuth, 'cond-entity', { req: 'cond-entity' }, new Precondition('absent'))).rejects.toThrow('precondition-failed');
            await expect(dv.remove(noAuth, 'cond-entity', new Precondition('absent'))).rejects.toThrow('precondition-failed');

            await expect(dv.save(noAuth,   'cond-entity', { req: 'cond-entity' }, new Precondition('none-match', e1[DT_METADATA].version!))).rejects.toThrow('precondition-failed');
            await expect(dv.modify(noAuth, 'cond-entity', { req: 'cond-entity' }, new Precondition('none-match', e1[DT_METADATA].version!))).rejects.toThrow('precondition-failed');
            await expect(dv.remove(noAuth, 'cond-entity', new Precondition('none-match', e1[DT_METADATA].version!))).rejects.toThrow('precondition-failed');

            const e2 = await dv.save(noAuth, 'cond-entity', { req: 'cond-entity2' }, new Precondition('match', e1[DT_METADATA].version!));
            await expect(dv.modify(noAuth, 'cond-entity', { req: 'cond-entity' }, new Precondition('match', e1[DT_METADATA].version!))).rejects.toThrow('precondition-failed');

            const e3 = await dv.modify(noAuth, 'cond-entity', { req: 'cond-entity3' }, new Precondition('match', e2[DT_METADATA].version!));

            await dv.remove(noAuth, 'cond-entity', new Precondition('match', e3[DT_METADATA].version!));
            await expect(dv.remove(noAuth, 'cond-entity', new Precondition('match', e3[DT_METADATA].version!))).rejects.toThrow('precondition-failed');
            await expect(dv.remove(noAuth, 'cond-entity', new Precondition('none-match', e3[DT_METADATA].version!))).rejects.toThrow('not-found');
        });

        it('handles conditional DataTable list ops', async () => {
            expect.hasAssertions();

            const dv = new CommonDataTable(def, db, 'dv', 'id');

            // tableMetadata() not supported, so all strong conditions should fail
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('present'))).rejects.toThrow('precondition-failed');
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('absent'))).rejects.toThrow('precondition-failed');
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('none-match', 'some-version'))).rejects.toThrow('precondition-failed');
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('match', 'some-version'))).rejects.toThrow('precondition-failed');

            // Legacy conditions should be ignored, since resource has no timestamp
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('modified-since', new Date()))).resolves.not.toThrow();
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('unmodified-since', new Date(0)))).resolves.not.toThrow();

            dv.tableMetadataStatus = false;

            // Strong conditions should work now
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('present'))).rejects.toThrow('precondition-failed');
            await expect(dv.append(noAuth, { req: 'cond-list1' }, new Precondition('absent'))).resolves.not.toThrow();

            // Legacy conditions should be ignored, since resource has no timestamp
            await dv.append(noAuth, { req: 'cond-list2' }, new Precondition('modified-since', new Date()));
            await dv.append(noAuth, { req: 'cond-list3' }, new Precondition('unmodified-since', new Date(0)))

            dv.tableMetadataStatus = true;

            await dv.append(noAuth, { req: 'cond-list4' }, new Precondition('present'))
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('absent'))).rejects.toThrow('precondition-failed');

            const list = await dv.list(noAuth, { order: 'req', limit: 1 });

            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('none-match', 'foo', list[DT_METADATA].version!, 'bar'))).rejects.toThrow('precondition-failed');
            await dv.append(noAuth, { req: 'cond-list5' }, new Precondition('match', 'foo', list[DT_METADATA].version!, 'bar'));
            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('match', 'foo', list[DT_METADATA].version!, 'bar'))).rejects.toThrow('precondition-failed');

            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('modified-since', new Date(Date.now() + 2000)))).rejects.toThrow('precondition-failed');
            await dv.append(noAuth, { req: 'cond-list6' }, new Precondition('modified-since', new Date(Date.now() - 2000)));

            await expect(dv.append(noAuth, { req: 'cond-list' }, new Precondition('unmodified-since', new Date(Date.now() - 2000)))).rejects.toThrow('precondition-failed');
            await dv.append(noAuth, { req: 'cond-list7' }, new Precondition('unmodified-since', new Date(Date.now() + 2000)));
        });
    });
}
