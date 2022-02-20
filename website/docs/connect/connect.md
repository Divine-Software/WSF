# Accessing Resources

In WSF, everything you can communicate with is a resource described by an URL[^1], or at least an URI[^2]. Our [URI]
class extends the standard JavaScript [URL] class with methods to operate on local and remote resources alike in a
standardized way.

There is no real difference between loading a file from the local filesystem and accessing a document on a remote web
server. But there is also no real difference between inserting a row into a table in an SQL database and storing a JSON
document in a file, or sending an email to a mailing list. It's all just reads and writes to different kinds of
resources.

The following operations are defined for [URI]s:

* [info]: Returns metadata about the resource, (via `stat()` for local files or `HEAD` for HTTP resources, for example).
* [list]: Returns metadata about the resource's children (like getting the content of a local directory).
* [load]: Reads the resource and returns a parsed representation of it.
* [save]: Writes something to the resource, possibly after having serialized the message into a sequence of bytes.
* [append]: Like `save`, but appends the data to the resource instead of replacing it.
* [modify]: Applies some kind of protocol-specific modification; for HTTP, this maps to a `PATCH` request.
* [remove]: Removes the resource.
* [query]: Issues a protocol-specific query to the resource and returns the response. Commonly used to query SQL databases.
* [watch]: Starts listening for changes from the resource and generates a stream of change events. Can be used to watch
  the local filesystem, but also to read a *change data feed* from a database.

[^1]:     [Uniform Resource Locator](https://en.wikipedia.org/wiki/URL)
[^2]:     [Uniform Resource Identifier](https://en.wikipedia.org/wiki/Uniform_Resource_Identifier)

[URI]:    ../api/classes/divine_uri.URI.md
[URL]:    https://nodejs.org/api/url.html

[info]:   ../api/classes/divine_uri.URI.md#info
[list]:   ../api/classes/divine_uri.URI.md#list
[load]:   ../api/classes/divine_uri.URI.md#load
[save]:   ../api/classes/divine_uri.URI.md#save
[append]: ../api/classes/divine_uri.URI.md#append
[modify]: ../api/classes/divine_uri.URI.md#modify
[remove]: ../api/classes/divine_uri.URI.md#remove
[query]:  ../api/classes/divine_uri.URI.md#query
[watch]:  ../api/classes/divine_uri.URI.md#watch
