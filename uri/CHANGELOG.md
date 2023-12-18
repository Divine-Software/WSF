# @divine/uri

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
