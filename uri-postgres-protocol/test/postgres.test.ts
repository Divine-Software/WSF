import { q, URI } from '@divine/uri';
import { describeCommonDBTest } from '@divine/uri/build/test/protocols/common-database-tests';
import '../src';

describeCommonDBTest({
    name: 'CockroachDB',
    uri:  new URI('pg://root@localhost:26257/_divine_uri_test_'),
    createDT: [q`
        create table dt (
            "serial"  serial unique primary key,
            "uuid"    uuid,
            "int"     int4,
            "bigint"  bigint,
            "real"    real,
            "double"  double precision,
            "decimal" decimal(30,5),
            "bigints" bigint[],
            "words"   text[],
            "text"    text,
            "bin"     bytea,
            "ts"      timestamp,
            "tstz"    timestamptz,
            "bool"    boolean,
            "json"    jsonb,
            "null"    text
        )
    `, q`comment on column dt.text is 'This is plain text'`],
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
    returning:    true,
    rowKey:       false,
    selectCount:  true,
    comments:     true,
    upsert:       'yes',
});

describeCommonDBTest({
    name: 'PostgreSQL',
    uri:  new URI('pg://localhost/_divine_uri_test_'),
    createDT: [q`
        create table dt (
            "serial"   bigserial unique primary key,
            "uuid"     uuid,
            "int"      int,
            "bigint"   bigint,
            "real"     real,
            "double"   double precision,
            "decimal"  decimal(30,5),
            "bigints"  bigint[],
            "words"    text[],
            "text"     text,
            "bin"      bytea,
            "ts"       timestamp,
            "tstz"     timestamptz,
            "bool"     boolean,
            "json"     jsonb,
            "null"     text
        )
    `, q`comment on column dt.text is 'This is plain text'`],
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
    returning:    true,
    rowKey:       false,
    selectCount:  true,
    comments:     false, // No column_comment in information_schema.columns
    upsert:       'with-key',
});
