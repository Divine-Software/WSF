---
sidebar_position: 1
---

# Local Files

When accessing local files, the file name extension is used to determine what kind of file it is and what
parser/serializer to use when reading and writing. If the name of the file to access varies, it's probably better to
specify the media type manually in order to avoid surprises. By the way, the function used to determine the media type
of local files is also directly available as [guessContentType].

The `file:` protocol is default when creating an URI, since all relative URLs will be resolved against the *current
working directory* by default, so to access a local file, you can just pass in a relative or absolute path that conforms
to the URL/URI specifications. However, Windows-style paths are not URL paths; to create an URI from a native path name,
use [FileURI.create]. If you really need to create URIs for non-native paths, the [encodeFilePath] function accepts both
`posix`- and `windows`-style paths.

## Reading Files and Directories

To read and parse a file, just [load][FileURI.load] it, optionally overriding the media type to invoke a non-default
parser; to list objects in a directory, [list][FileURI.list] it.

```ts
import { FileURI, URI } from '@divine/uri';

const json = await new URI('package.json').load();
const users = await FileURI.create('/etc/passwd').load<string[][]>('text/csv; x-separator=:');
const files = await new URI('.').list();
```

## Writing Files

Use [save] to write files. The default file format is inferred from the file name or data, but you can also specify a formay manually:

```ts
import { URI } from '@divine/uri';

const config = {
    mode: 'dev',
    db: {
        uri: 'pg://localhost/default',
        username: 'sa',
    }
};

await new URI('file.log').save('A text file! 😀\n');
await new URI('file.json').save(config);
await new URI('file.toml').save(config);
await new URI('file.conf').save(config, 'application/yaml');
```

## Watching Files

Open and iterate a filesytem event stream using [watch], like this:

```ts
import { URI } from '@divine/uri';

for await (const event of new URI('.').watch()) {
    console.log(event);
}
```

Note that in order to watch files, the optional peer dependency [chokidar] must be available.

[guessContentType]: ../api/modules/divine_uri.md#guesscontenttype
[encodeFilePath]:   ../api/modules/divine_uri.md#encodefilepath

[FileURI.create]:   ../api/classes/divine_uri.FileURI.md#create
[FileURI.list]:     ../api/classes/divine_uri.FileURI.md#list
[FileURI.load]:     ../api/classes/divine_uri.FileURI.md#load

[chokidar]:         https://www.npmjs.com/package/chokidar
