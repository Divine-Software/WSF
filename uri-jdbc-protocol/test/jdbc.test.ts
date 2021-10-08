import { q, URI } from '@divine/uri';
import { describeCommonDBTest } from '@divine/uri/build/test/protocols/common-database-tests';
// @ts-expect-error: No .d.ts file for node-java-maven
import mvn from 'node-java-maven';
import { resolve } from 'path';
import { classpath } from '../src';

// eslint-disable-next-line jest/no-hooks, jest/require-top-level-describe
beforeAll(async () => {
    const options = { packageJsonPath: resolve(__dirname, '../../../package.json') };
    const results = await new Promise<any>((resolve, reject) => mvn(options, (err: any, res: any) => err ? reject(err) : resolve(res)));
    classpath.push(...results.classpath);
});

describeCommonDBTest({
    name: 'H2',
    uri:  new URI('jdbc:h2:/tmp/_divine_uri_test_'),
    createDT: q`
        create table "dt" (
            "serial"  identity not null,
            "uuid"    uuid,
            "int"     integer,
            "bigint"  bigint,
            "real"    real,
            "double"  double,
            "decimal" decimal(30,5),
            "bigints" array,
            "words"   array,
            "text"    varchar comment 'This is plain text',
            "bin"     binary,
            "ts"      timestamp,
            "tstz"    timestamp with time zone,
            "bool"    bool,
            "json"    json,
            "null"    varchar
        )
    `,
    enableDT: {
        serial:   true,
        uuid:     true,
        int:      true,
        bigint:   true,
        real:     true,
        double:   true,
        decimal:  true,
        bigints:  true,
        words:    true,
        text:     true,
        bin:      true,
        ts:       true,
        tstz:     true,
        bool:     true,
        json:     true,
        null:     true,
    },
    isolation:    q`isolation level serializable`,
    schemaInfo:   true,
    returning:    false,
    rowKey:       true,
    comments:     true,
    upsert:       'yes',
    defaultVal:   true,
});
