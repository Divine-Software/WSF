---
sidebar_position: 2
---

# Filters

[WebFilters][WebFilter] are used to curry resources. They can intercept requests before the resource handler gets to
handle them, or modify the response afterwards. Like [WebResources][WebResource], the paths a filter applies to is
specified by a regular expression in a static [path] property. Unlike resources, it's both allowed and encouraged for
multiple filters to be active during the request processing; the filters will be invoked in the order they were
registered.

When a [WebFilter] matches an incoming request, an instance is [constructed][WebFilterCtor] (via `new`), where it
receives a reference to the [WebService Context], a custom object that you provide when the [WebService] is created.
This is how the filter instances can access various services and configurations in your application.

Then, the [filter] method is invoked. It receives three arguments: a `next` function that invokes the next filter or
resource handler in the chain, `args`, the request arguments, and finally a `resource` function that can be used to
fetch a reference to the resource that the request matched.

The filter can inspect the incoming request in the [same way](./resources.md#request-arguments) resources can, and then
decide if `next` should be called to generate a [WebResponse] — which may be modified before it's returned. If the filter
needs to provide information to downstream filters or the active resource, it can do so either by setting custom
parameters on the request via [WebRequest.setParam], or fetch a reference to the actual [WebResource] instance via the
`resource` argument.

Filters can generate responses in the [same way](./resources.md#generating-responses) as resources do, but usually just
pass along the return value from `next`.

[WebArguments]:         ../api/@divine/web-service/classes/WebArguments.md
[WebFilter]:            ../api/@divine/web-service/interfaces/WebFilter.md
[WebFilterCtor]:        ../api/@divine/web-service/interfaces/WebFilterCtor.md#constructor
[WebResource]:          ../api/@divine/web-service/interfaces/WebResource.md
[WebResponse]:          ../api/@divine/web-service/classes/WebResponse.md
[WebService]:           ../api/@divine/web-service/classes/WebService.md

[WebService Context]:   ../api/@divine/web-service/classes/WebService.md#context
[WebRequest.setParam]:  ../api/@divine/web-service/classes/WebRequest.md#setparam

[filter]:               ../api/@divine/web-service/interfaces/WebFilter.md#filter
[path]:                 ../api/@divine/web-service/interfaces/WebFilterCtor.md#path
