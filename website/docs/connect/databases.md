---
sidebar_position: 3
---

# Databases

Since database connections are also commonly defined by an URL or URI, you might expect that there is some kind of
support for databases in one of the [URI subclasses][DatabaseURI] as well. And you wouldn't be wrong: The [query] method
can be used to execute arbitrary queries to SQL databases; you can read more about this in the section about [queries].

What you might not expect is that most of the other methods of [URI] also work on database URIs. But what does really it
mean to [load], [save] or [remove] a database? Probably not what you think at first.

## DB References

Truth to be told, this author is a bit old-school when it comes to databases; I don't mind writing SQL queries and I'm
not really an [ORM] kind of person[^1]. On the other hand, especially when building REST services, writing lots of
trivial SQL queries just to access database rows can quickly become a bit repetitive.

That's why the WSF provides something we call [DB references], a small expression language that lives in the URI's
*fragment* part and which defines, in a compact manner, what table, rows and columns a specific URI references.

So the answer to the question above is not some kind of database backup and restore handling, but rather direct access
to table rows inside the database. Let's show some quick examples.

## Reading Rows

Assuming you have a `users` table with `id` as primary key, here is how to retrieve it using [load], given an `userID`
identifier:

```ts
const user = await dbURI.$`#users;one?(eq,id,${userID})`.load<User>();
```

The `$` method in URI just creates a new relative URI from a template literal, and in this case we set the fragment part
while leaving everything else as-is. `users` is our table, `;one` means "fetch one single row" and `eq` means "equals".
Should you instead want to fetch all users from the US, you'd write:

```ts
const users = await dbURI.$`#users?(eq,country,us)`.load<User[]>();
```

It's also possible to reference a single cell in the database. In the following example, we retrieve only a user's name
from the database, as a `String`[^2].

```ts
const name = await dbURI.$`#users(name);scalar?(eq,id,${userID})`.load<String>();
```

## Writing Rows

To insert a row into a table, use [append]. Depending on what database you use, a generated key is either available
directly (if `INSERT ... RETURNING *` is supported), or via [DBResult.rowKey]:

```ts
import { FIELDS } from '@divine/uri';

const user = await dbURI.$`#users`.append<User>({ name: 'John Doe', country: 'us' });
const userID = user.id ?? user[FIELDS][0].rowKey;
```

Some databases implement `UPSERT` or `INSERT ... ON CONFLICT UPDATE ...`, which updates an existing row if the *primary
key exists*[^3], or inserts the row if it doesn't. For those databases, [save] may be used too:

```ts
const user = await dbURI.$`#users`.save<User>({ id: userID, name: 'John Doe', country: 'us' });
```

Existing rows may be updated with [modify], like this:

```ts
await dbURI.$`#users?(eq,country,se)`.modify({ language: 'sv' });
```

And, naturally, rows can be deleted using [remove]:

```ts
await dbURI.$`#users(eq,id,${userID})`.remove();
```

## Notifications and Change Data Capture

[watch] allows you to subscribe to a live event feed from the database, which can be very useful for real-time services.
This is currently only implemented for PostgreSQL and CockroachDB, but at least MySQL should be able to support this as
well some day.

Here are a couple of small examples:

```ts
for await (const ev of dbURI.watch`experimental changefeed FOR orders`) {
    console.log('New order from CockroachDB', ev);
}
```

```ts
for await (const ev of dbURI.watch`listen order_channel`) {
    console.log('New notification from PostgreSQL', ev);
}
```

[^1]: But if you *do* enjoy [ORM]s such as [Prisma](https://www.prisma.io/) or [TypeORM](https://typeorm.io/), then by
      all means, use those great tools instead of our database abstractions. Nothing in the WSF depends on how data is
      persisted or by what methods the data is accessed.
[^2]: Yes, `String`, not `string`. Since the URI methods also return [Metadata]/[DBMetadata], it cannot return primitive
      values. To explicitly convert the object to a `string`, use `toString` or `valueOf`.
[^3]: For this reason, [save] is unfortunately not available for MySQL: it updates on *any* duplicate key conflict, not
      just on primary key conflicts. This is very dangerous and a potential security issue, so we do not support this.

[ORM]:             https://en.wikipedia.org/wiki/Object%E2%80%93relational_mapping
[URI]:             ../api/classes/divine_uri.URI.md
[queries]:         ../query/query.md

[Metadata]:        ../api/interfaces/divine_uri.Metadata.md
[DBMetadata]:      ../api/interfaces/divine_uri.DBMetadata.md
[DBResult.rowKey]: ../api/classes/divine_uri.DBResult.md#rowkey
[DatabaseURI]:     ../api/classes/divine_uri.DatabaseURI.md
[DB references]:   ../api/classes/divine_uri.DatabaseURI.md#crud-row-operations-with-db-references
[load]:            ../api/classes/divine_uri.DatabaseURI.md#load
[save]:            ../api/classes/divine_uri.DatabaseURI.md#save
[append]:          ../api/classes/divine_uri.DatabaseURI.md#append
[modify]:          ../api/classes/divine_uri.DatabaseURI.md#modify
[remove]:          ../api/classes/divine_uri.DatabaseURI.md#remove
[query]:           ../api/classes/divine_uri.DatabaseURI.md#query
[watch]:           ../api/classes/divine_uri.DatabaseURI.md#watch
