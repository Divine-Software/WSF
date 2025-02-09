---
sidebar_position: 2
---

# JSON, TOML and YAML

There is really not much to say about these parsers, except that they are very commonly used and have no special
configuration options. They map between JavaScript object and primitives and byte streams.

Worth mentioning is that YAML files may actually contain multiple `---`-separated YAML documents. All YAML documents may
be accessed via the [FIELDS] array, as specified by the [WithFields] interface.

Format | Main Media Type    | Parser
-------|--------------------|-------------
[JSON] | `application/json` | [JSONParser]
[TOML] | `application/toml` | [TOMLParser]
[YAML] | `application/yaml` | [YAMLParser]

```ts
import { Parser, URI } from '@divine/uri`;

const json = await new URI('file.json').load();
await new URI('file.yaml').save();

const tomlString = (await Parser.serializeToBuffer(json, 'application/toml')).toString();
```

[JSON]:       https://json.org/
[TOML]:       https://toml.io/
[YAML]:       https://eemeli.org/yaml
[JSONParser]: ../api/@divine/uri/classes/JSONParser.md
[TOMLParser]: ../api/@divine/uri/classes/TOMLParser.md
[YAMLParser]: ../api/@divine/uri/classes/YAMLParser.md
[FIELDS]:     ../api/@divine/uri/index.md#fields
[WithFields]: ../api/@divine/uri/interfaces/WithFields.md
