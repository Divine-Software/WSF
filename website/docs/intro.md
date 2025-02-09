---
sidebar_label: Introduction
sidebar_position: 1
---

# The Divine Web Service Framework

*Eons* ago, before Node.js even existed, the author of this framework desired a powerful, secure and easy to use
platform for building web services. Out of that desire came *ESXX*, a Java-based web application server that
incorporated Rhino to run multithreaded web services written in JavaScript, provided safe and easy to use interfaces to
SQL databases, used JSON or E4X for view models and the *Saxon XSLT processor* to transform the documents/models into
HTML for the clients.

The *Divine Web Service Framework* is the spiritual successor of that project, taking everything that was good about it
and reimagining it for the modern era.

Gone is the server-side templating support — we write client side web applications now — and E4X is since long dead[^1],
but the focus on web standards and correctness, developer friendly and secure, injection-safe [interfaces][DatabaseURI]
to SQL databases, aversion to callbacks — thanks God for `async` and `await` — and the ubiquitous [URI] class are some
of the good things that remain.

## Overview

In one sense, the WSF is just a collection of Node.js modules that happens to have something to do with the web. But
each module serves a purpose, and together they form a powerful framework for writing TypeScript web services.

There are two main modules in WSF:

* [@divine/uri], call it the "client" API if you wish, handles everything I/O: accessing local and remote resources of
  all kinds, parsing and serializing data, encoding and decoding byte streams, handling authentication.
* [@divine/web-service], the "server" API, is all about building world-class REST web APIs and RPC micro-services, with
  advanced features such as streaming, ETag and precondition handling, and content negotiation. *Caveat emptor: the
  module does* **not yet** *have all those advanced features. But it will one day.*

The bulk of the WSF documentation is provided in the form of API documentation, so please go ahead and click those links
above. In the following sections, we will instead focus on a few use cases and recipes for how to handle them.

[^1]: [E4X] might be dead, but the [@divine/x4e] module is worth checking out if you need to work with HTML or XML. It
      it heavily inspired by E4X, but redesigned for modern TypeScript/JavaScript and [TSX]/[JSX].

[DatabaseURI]:         api/@divine/uri/classes/DatabaseURI.md
[URI]:                 api/@divine/uri/classes/URI.md

[@divine/uri]:         api/@divine/uri/index.md
[@divine/web-service]: api/@divine/web-service/index.md
[@divine/x4e]:         api/@divine/x4e/index.md

[E4X]:                 https://en.wikipedia.org/wiki/ECMAScript_for_XML
[JSX]:                 https://reactjs.org/docs/introducing-jsx.html
[TSX]:                 https://www.typescriptlang.org/docs/handbook/jsx.html
