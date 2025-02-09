---
sidebar_position: 2
---

# Data Formats

Whenever you read something from an [URI], one of the built-in parsers is used to make sense of the byte stream
received; likewise, whenever you write something, one of the parsers is responsible for converting whatever object or
primitive you try to write into a byte stream that can be transmitted and stored at the resource the URI references.

To parse or serialize something manually, you usually use the static methods [Parser.parse] and [Parser.serialize], but
it's also possible to manually create a parser and calling its methods directly. Please see [Parser] for a list of all
known parsers and what media types the handle.

Additionally, byte streams may also be transformed by *encoders*. Like parsers, encoders are usually invoked manually
using [Encoder.encode] and [Encoder.decode], but you can instantiate encoders yourself too. See [Encoder] for a list of
available encoders. Encoders are used to handle headers such as `content-encoding` and `transfer-encoding` in HTTP, or
`content-transfer-encoding` in MIME.

In the following sections, we'll discuss some of the available parsers and encoders.

[URI]:               ../api/@divine/uri/classes/URI.md
[Encoder]:           ../api/@divine/uri/classes/Encoder.md
[Encoder.encode]:    ../api/@divine/uri/classes/Encoder.md#encode
[Encoder.decode]:    ../api/@divine/uri/classes/Encoder.md#decode
[Parser]:            ../api/@divine/uri/classes/Parser.md
[Parser.parse]:      ../api/@divine/uri/classes/Parser.md#parse
[Parser.serialize]:  ../api/@divine/uri/classes/Parser.md#serialize
