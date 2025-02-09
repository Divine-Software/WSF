import { DBParamsSelector, q, URI } from '@divine/uri';
import { describeCommonDBTest } from '@divine/uri/build/test/protocols/common-database-tests';
import '../src';

describeCommonDBTest({
    name: 'SQLite',
    uri:  new URI('sqlite:/tmp/_divine_uri_test_.db'),
    createDT: q`
        create table dt (
            "serial"  integer not null unique primary key autoincrement,
            "uuid"    text,
            "int"     integer,
            "bigint"  integer,
            "real"    real,
            "double"  real,
            "decimal" text,
            "bigints" text,
            "words"   text,
            "text"    text,
            "bin"     blob,
            "ts"      text,
            "tstz"    text,
            "bool"    integer,
            "json"    text,
            "null"    text
        )
    `,
    enableDT: {
        serial:   true,
        uuid:     true,
        int:      false,
        bigint:   true,
        real:     true,
        double:   true,
        decimal:  true,
        bigints:  false,
        words:    false,
        text:     true,
        bin:      true,
        ts:       false,
        tstz:     false,
        bool:     false,
        json:     false,
        null:     true,
    },
    isolation:    q`deferred`,
    schemaInfo:   true,
    returning:    true,
    rowKey:       true,
    comments:     false,
    upsert:       'with-key',
    defaultVal:   false,
});

describeCommonDBTest({
    name: 'SQLite (no bigints)',
    uri:  new URI('sqlite:/tmp/_divine_uri_test_.db').addSelector<DBParamsSelector>({
        params: { connectOptions: { defaultSafeIntegers: false } }
    }),
    createDT: q`
        create table dt (
            "serial"  integer not null unique primary key autoincrement,
            "uuid"    text,
            "int"     integer,
            "bigint"  integer,
            "real"    real,
            "double"  real,
            "decimal" text,
            "bigints" text,
            "words"   text,
            "text"    text,
            "bin"     blob,
            "ts"      text,
            "tstz"    text,
            "bool"    integer,
            "json"    text,
            "null"    text
        )
    `,
    enableDT: {
        serial:   true,
        uuid:     true,
        int:      true,
        bigint:   false,
        real:     true,
        double:   true,
        decimal:  true,
        bigints:  false,
        words:    false,
        text:     true,
        bin:      true,
        ts:       false,
        tstz:     false,
        bool:     false,
        json:     false,
        null:     true,
    },
    isolation:    q`deferred`,
    schemaInfo:   true,
    returning:    true,
    rowKey:       true,
    comments:     false,
    upsert:       'with-key',
    defaultVal:   false,
});
