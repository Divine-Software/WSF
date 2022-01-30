---
sidebar_position: 1
---

# Bytes and Text

The most basic type of parsers are the byte and text parsers. There are two kind of byte parsers, one that collects all
bytes in a byte stream into a [Buffer], and one that just passes each chunk through as they arrive[^1]. The text parser
interprets the byte stream according to some character encoding and convers to JavaScript strings.

Format      | Main Media Type                         | Parser
------------|-----------------------------------------|--------------------
[Buffer]    | `application/octet-stream`              | [BufferParser]
Byte stream | `application/vnd.esxx.octet-stream`[^2] | [PassThroughParser]
Text        | `text/plain`                            | [StringParser]

The Buffer parser is useful when you need to load some resource of unknown type, and the pass-through parser can be used
for large objects that wont fit in memory. The text parser understands the most common character encodings, specified by
the `charset` media type parameter.

The following examples shows how an ISO-8859-1-encoded text file might be read into memory in a couple of different
ways[^3].

```ts
import { ContentType } from '@divine/headers';
import { URI } from '@divine/uri';

const latin1 = new URI('latin1-file.txt');
const buffer = await latin1.load<Buffer>(ContentType.bytes);
const string = (await latin1.load('text/plain; charset=iso-8859-1')).valueOf();
const stream: Buffer[] = [];

for await (const chunk of latin1 /* or latin1.load<AsyncIterator<Buffer>>(ContentType.stream) */ ) {
    stream.push(chunk);
}
```

[^1]: In the WSF, byte streams are represented as `AsyncIterable<Buffer>`.
[^2]: This custom media type is only used to identify the pass-through parser and should not be used otherwise.
[^3]: Notice how the [URI] class is also an `AsyncIterable<Buffer>`, which can be iterated directly.

[Buffer]:            https://nodejs.org/api/buffer.html
[BufferParser]:      ../api/classes/divine_uri.BufferParser.md
[PassThroughParser]: ../api/classes/divine_uri.PassThroughParser.md
[StringParser]:      ../api/classes/divine_uri.StringParser.md
[URI]:               ../api/classes/divine_uri.URI.md
