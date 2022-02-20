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
[JSONParser]: ../api/classes/divine_uri.JSONParser.md
[TOMLParser]: ../api/classes/divine_uri.TOMLParser.md
[YAMLParser]: ../api/classes/divine_uri.YAMLParser.md
[FIELDS]:     ../api/modules/divine_uri.md#fields
[WithFields]: ../api/interfaces/divine_uri.WithFields.md
