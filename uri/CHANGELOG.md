# @divine/uri

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
