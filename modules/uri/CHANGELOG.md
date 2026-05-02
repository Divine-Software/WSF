# @divine/uri

## 2.0.0-v2.6

### Minor Changes

- 7919630: Added 'true' and 'false' constant DB reference filters.

## 2.0.0-v2.5

### Patch Changes

- 890a6b3: uri template literal handled array arguments incorrectly.

## 2.0.0-v2.4

### Patch Changes

- 83d3ef6: Accept bigint in a few more places where number is already accepted.
- c0a4f54: Moved Precondition.assert to DataTableBase and WebArguments.
- 24fbb6a: Parameterized the JSON, TOML and YAML parser/serializer.

## 2.0.0-v2.3

### Minor Changes

- a5748d6: Export sync utility functions to parse/serialize JSON/TOML/YAML the WSF v2 way.

### Patch Changes

- 8ebb671: Better typing of DataTableBase.subset().

## 2.0.0-v2.2

### Minor Changes

- 54102e2: Added DataTableBase.subset().

### Patch Changes

- a86ff50: DataTable keys may also be number or bigint, in addition to string.

## 2.0.0-v2.1

### Patch Changes

- 4347979: Export BasicTypes, Params and StringParams from @divine/uri.
- 2065903: Added an record translation layer to DBDataTable.

## 2.0.0-v2.0

### Major Changes

- c457bd7: Require NodeJS 22.
- 9693bef: JSON/TOML/YAML now use bigint for all integers and number for floats.
- 3391e7d: Renamed DB-reference params count => limit, sort => order. Added totalCount support.
- 0ecbe14: uri`...` now return URIString to prevent double encoding. Added uri.raw().
- 6177c73: Use {} in DB-reference filters instead of ().
- 69bc813: All untrusted Record/hash objects now have a null prototype instead of being Objects.
- b04f74c: Replaced toObject/toPrimitive with wrap/unwrap/Wrap<T>/Unwrappable<T>.

### Minor Changes

- 5355c29: Added DBParams.sessionInit for custom DB connection setup.
- e3a4d2e: DataTable.
- 487ac86: Expose underlying type of DBParams.connectOptions.
- 4d879fc: Bumped deps, including TS.
- 0a57e8d: Bumped deps.
- 6d08a9d: URI.addSelector() now replaces or merges existing selectors if identical.
- d9d41a4: Symbol properties are now non-enumerable.
- fdc19f2: DB references operators 'in', 'null' and custom extension functions added. Utility function dbRef().

### Patch Changes

- edb2b71: Switch to Signals fork @indutny/dicer of Dicer.
- 5c8ba4d: Bumped dev deps (incl. eslint, typescript).
- a07c7b5: Use commmon toString() to ensure Date is always ISO-encoded.
- Updated dependencies [c457bd7]
- Updated dependencies [4d879fc]
- Updated dependencies [3cf79fb]
- Updated dependencies [f6e8c96]
- Updated dependencies [69bc813]
- Updated dependencies [d9d41a4]
- Updated dependencies [a5dffeb]
- Updated dependencies [5c8ba4d]
  - @divine/commons@2.0.0-v2.0
  - @divine/headers@2.1.0-v2.0

## 1.0.0

- Version bump.

## 0.6.0

### Minor Changes

- 8ba8bcf: Loading scope 'one' or 'scalar' from empty RS now throws.
- 080ffb0: Parameterized toPrimitive().

## 0.5.1

### Patch Changes

- 38d8001: DatabaseURI.query should propagate DB exceptions as-is.

## 0.5.0

### Minor Changes

- 2ac21e8: HTTPURI now logs requests using URIParams.console.

### Patch Changes

- d9cdf40: IOError and its subclasses are now generic.

## 0.4.9

### Patch Changes

- 5d0ecd5: Use empty object instead of Params for URIParams and connectOptions.

## 0.4.8

### Patch Changes

- Updated dependencies [537fa7b]
  - @divine/commons@0.5.0

## 0.4.7

### Patch Changes

- e6c56ed: Normalize Encoder.type and Parser.contentType.
- a9c9f7b: Made href, origin, protocol, username, password in URI read-only for real.
- 7b23f38: Added support for the data: URI protocol.
- Updated dependencies [53cbbf1]
  - @divine/headers@2.0.4

## 0.4.6

### Patch Changes

- 8f552c4: Bumped all deps except Parse5.
- Updated dependencies [8f552c4]
  - @divine/commons@0.4.4
  - @divine/headers@2.0.3

## 0.4.5

### Patch Changes

- 3a380f8: Bug fix when releasing DB connections.
- cbb626b: Bumped deps.
- 17668ed: Parser.serialize/Encoder.\*: Always return Readable. Parser.serialize now only passes Buffer/ReadableStream/URI through as-is. Other AsyncIterable are now once again correcly serialized (see EventStreamParser).
- Updated dependencies [601b686]
- Updated dependencies [04bb5ba]
  - @divine/commons@0.4.3

## 0.4.4

### Patch Changes

- 401e368: Bumped build tools.
- 2865b40: Minor docs/website update.
- Updated dependencies [401e368]
  - @divine/commons@0.4.2
  - @divine/headers@2.0.2

## 0.4.3

### Patch Changes

- e75b34f: AuthSchemeError now extends IOError
- 99362d8: Automatically serve text/html if namespace is HTML.
- f7f78a0: Tweaked IOError.toString() output to match @divine/web-service.
- d9ca132: Updated repo and bugs URL for new WSF branding.
- aa74524: Added TSDoc API documentation.
- Updated dependencies [d9ca132]
  - @divine/commons@0.4.1
  - @divine/headers@2.0.1
