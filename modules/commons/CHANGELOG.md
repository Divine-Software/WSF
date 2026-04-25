# @divine/commons

## 2.0.0-v2.0

### Major Changes

- c457bd7: Require NodeJS 22.
- f6e8c96: Added support for content negotiation.
- d9d41a4: Symbol properties are now non-enumerable.

### Minor Changes

- 4d879fc: Bumped deps, including TS.
- 3cf79fb: isOneOf is now a type guard. Added asError.
- 69bc813: All untrusted Record/hash objects now have a null prototype instead of being Objects.

### Patch Changes

- 5c8ba4d: Bumped dev deps (incl. eslint, typescript).

## 1.0.0

- Version bump.

## 0.5.0

### Minor Changes

- 537fa7b: Graceful shutdown and SSE support with HTTP/2.

## 0.4.4

### Patch Changes

- 8f552c4: Bumped all deps except Parse5.

## 0.4.3

### Patch Changes

- 601b686: isReadableStream/toReadableStream: Include AsyncIterable<> in return signature.
- 04bb5ba: toAsyncIterable: Throw TypeError if an AsyncIterable contains anything except Buffer or string.

## 0.4.2

### Patch Changes

- 401e368: Bumped build tools.

## 0.4.1

### Patch Changes

- d9ca132: Updated repo and bugs URL for new WSF branding.
