---
"@divine/uri": patch
---

Parser.serialize/Encoder.\*: Always return Readable. Parser.serialize now only passes Buffer/ReadableStream/URI through as-is. Other AsyncIterable are now once again correcly serialized (see EventStreamParser).
