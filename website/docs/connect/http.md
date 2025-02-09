---
sidebar_position: 2
---

# Web Resources

Obviously, talking to HTTP/HTTPS services is fully supported, including authentication and automatic redirect handling
(both according to the [Fetch] standard). Any response outside the `2xx` range will throw an [IOError], as will any
other network error. The `data` member will contain error metadata and also, if available, the original response.

## Common Operations

Here is how the [URI] methods relate to the most common HTTP verbs:

HTTP verb | URI method
----------|-----------
`HEAD`    | [info]
`GET`     | [load]
`PUT`     | [save]
`POST`    | [append]
`PATCH`   | [modify]
`DELETE`  | [remove]

Example:

```ts
import { URI } from '@divine/uri';
import { XML } from '@divine/x4e';
import { SEP01, Product } from '...';
import '@divine/uri-x4e-parser'; // Activate optional XML & HTML parsers

const sep01 = await new URI('https://www.stellar.org/.well-known/stellar.toml').load<SEP01>(); // Parse TOML
const ginfo = await new URI('http://google.com').load<XML>(); // Handle redirect, parse HTML

const apiBase = new URI('https://ws.example.com/v1/');
let  newBread = await apiBase.$`products`.append<Product>({ name: 'Bread', price: 5.99 });
newBread = await apiBase.$`products`.modify<Product>({ id: newBread.id, price: 6.99 });
```

Remember that the `$` method in URI just creates a new relative URI from a template literal. It can take a while to get
used to the syntax.

## Custom Queries

The [query] method in [HTTPURI] can be used to send arbitrary HTTP requests with custom headers:

```ts
import { HTTPURI, URI } from '@divine/uri';

const apiBase = new URI('https://ws.example.com/v1/') as HTTPURI;
const respose = apiBase.query('POST', { 'X-RPC-Operation': 'calculatePI' }, { digits: 13 });
```

## Authentication and Custom Headers

Independent of what URI method is used to issue the request, [selectors] are used to specify credentials or custom HTTP
headers to send. For example:

```ts
import { URI } from '@divine/uri';
import { MetaResponse } from '...';

const clientID = '...', clientSecret = '...';

const apiBase = new URI('https://api.example.com/')
    .addSelector({
        selector:    { authScheme: 'Basic' },
        credentials: { identity: clientID, secret: clientSecret },
        preemptive:  true,
    })
    .addSelector({ headers: {
        'x-protocol-version': '1.0',
    }});

const meta = await apiBase.$`meta`.load<MetaResponse>();
```

[Fetch]:     https://fetch.spec.whatwg.org

[URI]:       ../api/@divine/uri/classes/URI.md
[HTTPURI]:   ../api/@divine/uri/classes/HTTPURI.md
[IOError]:   ../api/@divine/uri/classes/IOError.md

[info]:      ../api/@divine/uri/classes/HTTPURI.md#info
[load]:      ../api/@divine/uri/classes/HTTPURI.md#load
[save]:      ../api/@divine/uri/classes/HTTPURI.md#save
[append]:    ../api/@divine/uri/classes/HTTPURI.md#append
[modify]:    ../api/@divine/uri/classes/HTTPURI.md#modify
[remove]:    ../api/@divine/uri/classes/HTTPURI.md#remove
[query]:     ../api/@divine/uri/classes/HTTPURI.md#query

[selectors]: ../api/@divine/uri/classes/URI.md#addselector
