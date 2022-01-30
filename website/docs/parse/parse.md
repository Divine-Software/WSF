---
sidebar_position: 2
---

# Data Formats

Whenever you read something from an [URI], one of the built-in parsers is used to make sense of the byte stream
received; likewise, whenever you write something, one of the parsers is responsible for converting whatever object or
primitive you try to write into a byte stream that can be transmitted and stored at the resource the URI references.

To parse or serialize something manually, you usuallt use the static methods [Parser.parse] and [Parser.serialize], but
it's also possible to manually create a parser and calling its methods directly. Please see [Parser] for a list of all
known parsers and what media types the handle.

Additionally, byte streams may also be transformed by *encoders*. Like parsers, encoders are usually invoked manually
using [Encoder.encode] and [Encoder.decode], but you can instanciate encoders yourself too. See [Encoder] for a list of
available encoders. Encoders are used to handle headers such as `content-encoding` and `transfer-encoding` in HTTP, or
`content-transfer-encoding` in MIME.

In the following sections, we'll discuss some of the available parsers and encoders.

[URI]:               ../api/classes/divine_uri.URI.md
[Encoder]:           ../api/classes/divine_uri.Encoder.md
[Encoder.encode]:    ../api/classes/divine_uri.Encoder.md#encode
[Encoder.decode]:    ../api/classes/divine_uri.Encoder.md#decode
[Parser]:            ../api/classes/divine_uri.Parser.md
[Parser.parse]:      ../api/classes/divine_uri.Parser.md#parse
[Parser.serialize]:  ../api/classes/divine_uri.Parser.md#serialize
