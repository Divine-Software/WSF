import { q, URI } from '@divine/uri';
import { describeCommonDBTest } from '@divine/uri/build/test/protocols/common-database-tests';
import '../src';

describeCommonDBTest({
    name: 'MySQL',
    uri:  new URI('mysql://root@localhost/_divine_uri_test_'),
    createDT: q`
        create table dt (
            "serial"  serial unique primary key,
            "uuid"    text,
            "int"     int,
            "bigint"  bigint,
            "real"    real,
            "double"  double precision,
            "decimal" decimal(30,5),
            "bigints" text,
            "words"   text,
            "text"    text comment 'This is plain text',
            "bin"     blob,
            "ts"      datetime(3),
            "tstz"    timestamp(3),
            "bool"    boolean,
            "json"    json,
            "null"    text
        ) charset=utf8mb4 collate utf8mb4_unicode_ci
    `,
    enableDT: {
        serial:   true,
        uuid:     true,
        int:      true,
        bigint:   true,
        real:     true,
        double:   true,
        decimal:  true,
        bigints:  false,
        words:    false,
        text:     true,
        bin:      true,
        ts:       true,
        tstz:     true,
        bool:     false,
        json:     true,
        null:     true,
    },
    schemaInfo:   true,
    returning:    false,
    rowKey:       true,
    selectCount:  false,
    comments:     true,
    upsert:       'no',
});
