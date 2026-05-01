# @divine/web-service

## 2.0.0-v2.3

### Minor Changes

- 301e5a0: The default RESTResource.transform() method is now recursive.
- 62da631: Whereever string | URL is used, also accept URIString.

## 2.0.0-v2.2

### Patch Changes

- a82593a: RESTResource.append() is an abstract method, not a property.

## 2.0.0-v2.1

### Patch Changes

- 4347979: Export BasicTypes, Params and StringParams from @divine/uri.

## 2.0.0-v2.0

### Major Changes

- c457bd7: Require NodeJS 22.
- 9693bef: JSON/TOML/YAML now use bigint for all integers and number for floats.
- 0f7427a: "public" protected members no longer use a leading underscore.

### Minor Changes

- 1fb49e1: Parameterized WebArguments.
- 8e58733: RESTResource.
- 4d879fc: Bumped deps, including TS.
- f6e8c96: Added support for content negotiation.
- 04b7c7c: Added WebArguments.integer() for bigint params.
- 9d2fa9a: Bumped deps.
- 4d68b7c: Now using Partial<Console> for loggers.
- 265d76d: Precondition handling.
- 881cb26: Added WebServier.initialService property.

### Patch Changes

- c21dc0a: Improved initialService typing.
- 5c8ba4d: Bumped dev deps (incl. eslint, typescript).
- b04f74c: Replaced toObject/toPrimitive with wrap/unwrap/Wrap<T>/Unwrappable<T>.
- Updated dependencies [edb2b71]
- Updated dependencies [c457bd7]
- Updated dependencies [5355c29]
- Updated dependencies [9693bef]
- Updated dependencies [3391e7d]
- Updated dependencies [e3a4d2e]
- Updated dependencies [0ecbe14]
- Updated dependencies [487ac86]
- Updated dependencies [4d879fc]
- Updated dependencies [3cf79fb]
- Updated dependencies [f6e8c96]
- Updated dependencies [6177c73]
- Updated dependencies [0a57e8d]
- Updated dependencies [69bc813]
- Updated dependencies [6d08a9d]
- Updated dependencies [d9d41a4]
- Updated dependencies [fdc19f2]
- Updated dependencies [a5dffeb]
- Updated dependencies [5c8ba4d]
- Updated dependencies [b04f74c]
- Updated dependencies [a07c7b5]
  - @divine/uri@2.0.0-v2.0
  - @divine/commons@2.0.0-v2.0
  - @divine/headers@2.1.0-v2.0

## 1.0.0

### Minor Changes

- 364572a: Added WebError.setHeader(), like in WebResponse.
- a3ce388: Log request times, warn when requests are slow.

### Patch Changes

- Updated dependencies [2ac21e8]
- Updated dependencies [d9cdf40]
  - @divine/uri@0.5.0

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
