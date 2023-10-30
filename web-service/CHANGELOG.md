# @divine/web-service

## 0.5.0

### Minor Changes

- 8e73121: WebService now links back to the WebServer where it's mounted.
- 47dbe79: Multi-protocol (HTTPS/HTTP2) and multi-port (WebServerProxy) support.
- 0eccaef: Added EVENT_FORMAT to EventAttributes, to override the serialization format.
- 537fa7b: Graceful shutdown and SSE support with HTTP/2.

### Patch Changes

- Updated dependencies [537fa7b]
  - @divine/commons@0.5.0
  - @divine/uri@0.4.8

## 0.4.6

### Patch Changes

- da2ec7e: Revert upgrade to CUID2 (it requires NodeJS 16)
- Updated dependencies [e6c56ed]
- Updated dependencies [53cbbf1]
- Updated dependencies [a9c9f7b]
- Updated dependencies [7b23f38]
  - @divine/uri@0.4.7
  - @divine/headers@2.0.4

## 0.4.5

### Patch Changes

- b071400: Resources can now return AsyncIterable for SSE streams (just like RPC services).
- 8f552c4: Bumped all deps except Parse5.
- 49fe23d: Don't use HTTP keep-alive on text/event-stream responses. Use 'no-store' to disable caching.
- Updated dependencies [8f552c4]
  - @divine/commons@0.4.4
  - @divine/headers@2.0.3
  - @divine/uri@0.4.6

## 0.4.4

### Patch Changes

- a86c4ba: Only `null` will result in NO_CONTENT and not any falsy value.
- Updated dependencies [3a380f8]
- Updated dependencies [601b686]
- Updated dependencies [cbb626b]
- Updated dependencies [04bb5ba]
- Updated dependencies [17668ed]
  - @divine/uri@0.4.5
  - @divine/commons@0.4.3

## 0.4.3

### Patch Changes

- 401e368: Bumped build tools.
- Updated dependencies [401e368]
- Updated dependencies [2865b40]
  - @divine/commons@0.4.2
  - @divine/uri@0.4.4
  - @divine/headers@2.0.2

## 0.4.2

### Patch Changes

- 0c9cce7: Fixed compiler error because of @ts-expect-error in public API.

## 0.4.1

### Patch Changes

- d9ca132: Updated repo and bugs URL for new WSF branding.
- aa74524: Added TSDoc API documentation.
- Updated dependencies [e75b34f]
- Updated dependencies [99362d8]
- Updated dependencies [f7f78a0]
- Updated dependencies [d9ca132]
- Updated dependencies [aa74524]
  - @divine/uri@0.4.3
  - @divine/commons@0.4.1
  - @divine/headers@2.0.1
