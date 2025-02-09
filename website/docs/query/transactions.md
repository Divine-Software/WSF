---
sidebar_position: 2
---

# Transactions

Executing transactions is just as simple as executing queries. If you need to protect a block of code in a transaction,
just wrap the code inside an async function and pass that function to [query]. When the function returns, the
transaction will commit; if it throws, it will be rolled back.

It's allowed to nest transactions, in which case *savepoints* will be automatically used instead.

```ts
import { FIELDS, URI } from '@divine/uri'
import '@divine/uri-postgres-protocol'; // Activate optional PostgreSQL driver
...

const db = new URI('pg://localhost/my-db');

export async function storeUser(user: User) {
    return await db.query(() => {
        const [ current ] = await db.query`select * from users where id = ${user.id} for update`;

        if (current) {
            ...
        } else {
            ...
        }
    });
}

export async function insertOrder(incomingOrder: IncomingOrder) {
    const { user, lines, ...order } = incomingOrder;

    return await db.query(() => {
        await storeUser(user);

        const orderID = (await db.query`insert into orders ${q.values(order)}`)[FIELDS][0].rowKey;
        await db.$`#order_lines`.append(lines.map((line) => ({ ...line, order: orderID })));

        return orderID;
    });
}
```

Notice how you don't have to pass connections around inside the transaction. Also notice the fact that `storeUser` will
begin a transaction if called by its own, but will in this case instead start a savepoint, since it's being called when
a transaction is already in progress.

## Automatic Deadlock Handling

If the database driver detects that a transaction has been aborted because of a deadlock, it will automatically sleep
for a while and then invoke the passed function again. See [Deadlock handling] in the API documentation for more
information.

This, and other transaction parameters, may be configured on a per-transaction basis by providing [query] with a
[DBTransactionParams] object before the callback function.

[query]:               ../api/@divine/uri/classes/DatabaseURI.md#query
[Deadlock handling]:   ../api/@divine/uri/classes/DatabaseURI.md#deadlock-handling
[DBTransactionParams]: ../api/@divine/uri/interfaces/DBTransactionParams.md
