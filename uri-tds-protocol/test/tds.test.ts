import { q, URI } from '@divine/uri';
import { describeCommonDBTest } from '@divine/uri/build/test/protocols/common-database-tests';
import '../src';

describeCommonDBTest({
    name: 'Microsoft SQL Server',
    uri:  new URI('sqlserver://sa:Pass1234@localhost/_divine_uri_test_'),
    createDT: q`
        create table dt (
            "serial"   bigint not null identity primary key,
            "uuid"     uniqueidentifier,
            "int"      int,
            "bigint"   bigint,
            "real"     real,
            "double"   double precision,
            "decimal"  decimal(30,5),
            "bigints"  text,
            "words"    text,
            "text"     nvarchar(max),
            "bin"      varbinary(max),
            "ts"       datetime2,
            "tstz"     datetimeoffset,
            "bool"     bit,
            "json"     ntext,
            "null"     text
        )
    `,
    enableDT: {
        serial:   true,
        uuid:     true,
        int:      true,
        bigint:   true,
        real:     true,
        double:   true,
        decimal:  false,
        bigints:  false,
        words:    false,
        text:     true,
        bin:      true,
        ts:       true,
        tstz:     true,
        bool:     true,
        json:     false,
        null:     true,
    },
    isolation:    q`isolation level serializable`,
    schemaInfo:   false,
    returning:    true,
    rowKey:       false,
    comments:     false,
    upsert:       'no',
    defaultVal:   true,
});
