---
sidebar_position: 1
---

# SQL Queries

Executing an SQL query is really simple: just use [query] as a tagged template string:

```ts
import { URI } from '@divine/uri';
import '@divine/uri-tds-protocol'; // Activate optional SQL Server driver

// docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=Pass1234" -p 1433:1433 -d mcr.microsoft.com/mssql/server
const db = new URI('sqlserver://sa:Pass1234@localhost/');

console.log(await db.query`select name, create_date from sys.databases where create_date < ${new Date()}`);
```

Under the hood, this seemingly simple query statement launches a connection pool, acquires a connection from that pool,
prepares the query and binds the parameter in an injection-safe way, executes the query, unpacks the response into an
array of row objects, and finally returns the connection to the pool and begins monitoring it, keeping it alive and
ready to handle the next query.

But you don't really need worry about any of that stuff. Just [query] and wait for the response. You can call [close] to
shut down the pool when you're done, but individual connections will close automatically when they have been inactive
for a while so you don't really have to do that either.

Custom configuration is possible via the [DBParamsSelector]&nbsp;[selector].

## Utility Functions

The WSF includes utilities in the [q] namespace to make it easier to write SQL queries, including functions to quote
identifiers, build `INSERT` and `UPDATE` queries and join subqueries into a single query.

```ts
const entities = [ ... ];
await db.query`insert into my_table ${q.values(entities)}`;
```

## CRUD Operations

Sometime (often, even?), all you want to do is to access one or more rows in a single table in a straight-forward way.
For such situations, the WSF uses its standard URI methods to *Create* (`INSERT`, `UPSERT`), *Read* (`SELECT`), *Update*
(`UPDATE`) and *Delete* (`DELETE`) table rows without the developer even having to write a query for it.

This is described more in detail in the [database connection] section, and even more so in the [DB references] API
documentation.

## Handling Results

The [query] method always returns an array of objects, where the objects are rows in the result set, and the properties
of the objects are the columns of the result set. If two or more columns share the same name, the last one wins.

The "raw" [result sets][DBResult] are always available via the [FIELDS] array, as specified by the [DBMetadata] and
[WithFields] interface, from where you can access the original tabular data and meta-information about the result set,
such as [column information][DBResult.columns], the number of [rows affected][DBResult.rowCount] by the query and the
last [generated primary key][DBResult.rowKey], for `IDENTITY` or `AUTOINCREMENT` columns.

Most of the time, the [FIELDS] array will only contain a single [DBResult], but one of the variants of [query] allows
for multiple queries to be executed in the same session, and in that case, the object returned will be from the *last*
result set (all which can be accessed via [FIELDS]).

[database connection]: ../connect/databases.md
[DB references]:       ../api/classes/divine_uri.DatabaseURI.md#crud-row-operations-with-db-references
[selector]:            ../api/classes/divine_uri.URI.md#addselector
[DBParamsSelector]:    ../api/interfaces/divine_uri.DBParamsSelector.md
[DBResult]:            ../api/classes/divine_uri.DBResult.md
[DBResult.columns]:    ../api/classes/divine_uri.DBResult.md#columns
[DBResult.rowCount]:   ../api/classes/divine_uri.DBResult.md#rowcount
[DBResult.rowKey]:     ../api/classes/divine_uri.DBResult.md#rowkey
[FIELDS]:              ../api/modules/divine_uri.md#fields
[WithFields]:          ../api/interfaces/divine_uri.WithFields.md
[DBMetadata]:          ../api/interfaces/divine_uri.DBMetadata.md
[q]:                   ../api/namespaces/divine_uri.q
[close]:               ../api/classes/divine_uri.DatabaseURI.md#close
[query]:               ../api/classes/divine_uri.DatabaseURI.md#query
