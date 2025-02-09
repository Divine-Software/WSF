---
sidebar_position: 1
---

# HTTP Resources

The [WebResource] interface defines how to handle requests to a specific path or path pattern. The resource handlers are
usually implemented as classes that implements the [WebResource] interface, with a static [path] property that defines
the locations of the handled resource. The path pattern is specified as a [regular expression] and can include [named
capture groups] to make certain parts of the path available as request arguments.

The path pattern should neither begin nor end with a slash, so to match the root path, you need to write an empty
regular expression: `RegExp('')`. A request can only be handled by one single [WebResource]; if multiple resources' path
pattern matches a request, only the one registered first will be used.

:::warning

When using *regular expression literals*, the forward slash — which is used as a path separator in URLs — must be
escaped with a backslash (like `/path\/to\/resource/`), or else the regular expression literal will be terminated
prematurely. It's also not possible to write an empty expression using literals — `//` is a comment, not an empty
regular expression literal. We'll provide helper functions to build these regular expressions in the future, but for
now, you'll need to write them by hand.

:::

## The Resource Lifecycle

Resource classes are registered once via the [addResource] or [addResources] methods.

When a [WebResource] matches an incoming request, an instance is [constructed][WebResourceCtor] (via `new`), where it
receives a reference to the [WebService Context], a custom object that you provide when the [WebService] is created.
This is how the resource instances can access various services and configurations in your application.

After that, it optional [init] method is invoked, if present, allowing the resource to perform asynchronous
initialization. Candidate operations for this method is to perform authentication[^1], look up parent resources or otherwise
ensure that the resource being accessed is valid.

:::info

For security reasons, we always instantiate a fresh [WebResource] for each request. We don't ever want information
(authentication, sessions etc) to leak between requests; by always creating new objects, this entire class of
vulnerabilities is effectively eliminated.

:::

Then, one of the [HEAD], [GET], [PUT], [POST], [PATCH], [DELETE] or [OPTIONS]&ZeroWidthSpace;[^2] methods is invoked. If
no such method is defined, [default] is called ([HEAD] falls back to [GET] first, then [default]).

Should any method throw an exception, [catch] is given a chance to handle the exception, before the error is propagated
to the handler registered via [setErrorHandler], or sent back to the client. The [WebError] exception (or a subclass
thereof) is the preferred exception to throw, since it can hold all information required in order to construct a valid
HTTP response. Any other exception will result in a *500 – Internal Server Error* response.

Finally, [close] is invoked and the object is disposed of. If the resource needs to perform any cleanup tasks, this is
the place to do that.

All methods in the [WebResource] interface are optional. If no matching method handler is found, *405 – Method Not
Allowed* is returned; if no resource matched at all, *404 – Not Found* is instead returned.

## Request Arguments

The method handlers in [WebResource] receives a single argument, a [WebArguments] instance, that provides access the
incoming request and parameters derived from it. This object contains utility methods to access and convert various
request parameters. To determine from where a parameter should be fetched, a single-character *type prefix* is used:

Type prefix | Parameter source                   | Example Input                              | Example Usage
------------|------------------------------------|--------------------------------------------|----------------
`?`         | URL query parameter                | `http://example.com?search=that&sort=name` | `?sort`
`$`         | Capture groups from [path] pattern | `RegExp("products/(?<product_id>[0-9]+)")` | `$product_id`
`@`         | Request header                     | `Content-Type: application/json`           | `@content-type`
`.`         | Request body                       | `{ "userName": "joe" }`                    | `.userName`
`~`         | Custom parameter                   | [WebRequest.setParam]`("user", { ... })`   | `~user`

## Generating Responses

To return a response with a *200 – OK* status code, well, just return it. This works for values of type `Buffer`, `URI`
and Node.js `ReadableStream` instances (*application/octet-stream*), plain old objects and arrays (*application/json*),
`string`, `number`, `bigint`, `boolean` and `Date` (*text/plain*), and [XML] objects, including those constructed via
the [html] tagged template literal or via TSX (*application/xml* or *text/html*, based on the XML namespace).

Anything that is `AsyncIterable` (but not `ReadableStream`) will be sent as [SSE/server-sent
events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/) (*text/event-stream*).

If you need to specify the status code or add response headers (including the `content-type`), wrap the response in a
[WebResponse] or [EventStreamResponse] object yourself.

:::note

In the future, the WSF will automatically negotiate the media type based on the return value and the `accept` and
`accept-charset` request parameters and serialize the response accordingly.

:::

[^1]: Another common pattern is to use a [WebFilter] to perform authentication for a wide range of resources, and simply
      provide the resources with some kind of *User* object via [WebRequest.setParam] if authentication (and
      authorization) succeeded.
[^2]: By default, `OPTIONS` is handled automatically by inspecting what methods the resource implements. However, if you
      use [default], you need to process `OPTIONS` manually since there is no way for the WSF to know what methods you
      handle.

[EventStreamResponse]:  ../api/@divine/web-service/classes/EventStreamResponse.md
[WebArguments]:         ../api/@divine/web-service/classes/WebArguments.md
[WebError]:             ../api/@divine/web-service/classes/WebError.md
[WebFilter]:            ../api/@divine/web-service/interfaces/WebFilter.md
[WebResource]:          ../api/@divine/web-service/interfaces/WebResource.md
[WebResourceCtor]:      ../api/@divine/web-service/interfaces/WebResourceCtor.md#constructor
[WebResponse]:          ../api/@divine/web-service/classes/WebResponse.md
[WebService]:           ../api/@divine/web-service/classes/WebService.md

[addResource]:          ../api/@divine/web-service/classes/WebService.md#addresource
[addResources]:         ../api/@divine/web-service/classes/WebService.md#addresources
[setErrorHandler]:      ../api/@divine/web-service/classes/WebService.md#seterrorhandler
[WebService Context]:   ../api/@divine/web-service/classes/WebService.md#context
[WebRequest.setParam]:  ../api/@divine/web-service/classes/WebRequest.md#setparam
[XML]:                  ../api/@divine/x4e/index.md#xml
[html]:                 ../api/@divine/x4e/index.md#html

[regular expression]:   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
[named capture groups]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Groups_and_Ranges#using_named_groups

[path]:                 ../api/@divine/web-service/interfaces/WebResourceCtor.md#path
[init]:                 ../api/@divine/web-service/interfaces/WebResource.md#init
[HEAD]:                 ../api/@divine/web-service/interfaces/WebResource.md#head
[GET]:                  ../api/@divine/web-service/interfaces/WebResource.md#get
[PUT]:                  ../api/@divine/web-service/interfaces/WebResource.md#put
[POST]:                 ../api/@divine/web-service/interfaces/WebResource.md#post
[PATCH]:                ../api/@divine/web-service/interfaces/WebResource.md#patch
[DELETE]:               ../api/@divine/web-service/interfaces/WebResource.md#delete
[OPTIONS]:              ../api/@divine/web-service/interfaces/WebResource.md#options
[default]:              ../api/@divine/web-service/interfaces/WebResource.md#default
[catch]:                ../api/@divine/web-service/interfaces/WebResource.md#catch
[close]:                ../api/@divine/web-service/interfaces/WebResource.md#close
