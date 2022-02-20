---
sidebar_label: Web Forms, MIME Messages
sidebar_position: 3
---

# Web Forms and MIME Messages

Parsing (and submitting) browser forms is an important part of the web. The WSF has built-in parsers for all standard
[enctype] values ([`application/x-www-form-urlencoded`][FormParser], [`multipart/form-data`][MultiPartParser] and
[`text/plain`][StringParser]).

Additionally, there is a built-in parser for (MIME) messages, which is primarily used for e-mails, but is also sometimes
used by web services if they need to return multiple responses for a single request, for example.

Format        | Main Media Type                     | Parser
--------------|-------------------------------------|------------------
HTML forms    | `application/x-www-form-urlencoded` | [FormParser]
MIME messages | `message/*`[^1]                     | [MessageParser]
Multi-part    | `multipart/*`[^2]                   | [MultiPartParser]

HTML forms are parsed to a string key/value record, and so are multi-part documents; however, the values of the latter
type may also be URIs and nested multi-part or message documents, in addition to strings. The "raw" fields are also
always available via the [FIELDS] array, as specified by the [WithFields] interface. This array may contain additional
information not available directly in the object returned when parsing. When serializing, the [FIELDS] array — if
present — always takes precedence over the direct object properties.

When parsing `multipart/form-data`, files will not be included in-line in the message, but rather stored locally in a
disk cache. The value of such fields will be an URI that you can [load] to read the file's content. Cached files will be
automatically purged after an hour (or when the current request finishes, when using [WebArguments.body]), but you may
[remove] them manually if you wish.

The following example just loads an email and dumps it to the console:

```ts
import { MimeMessage, URI } from '@divine/uri';

const email = await new URI('./message.eml').load<MimeMessage>();
console.log(`Message from ${email.headers.from}`, email.value);
```

Forms are mostly used in web services. Here's a trivial service that displays information about uploaded files:

```ts
import { ContentDisposition } from '@divine/headers';
import { FIELDS, MultiPartData, URI } from '@divine/uri';
import { WebArguments, WebResource, WebServer, WebService } from '@divine/web-service';
import { html } from '@divine/x4e';
import '@divine/uri-x4e-parser'; // Activate optional XML & HTML parsers

new WebServer('localhost', 3333, new WebService(null).addResource(class implements WebResource {
    static path = RegExp('');

    async GET() {
        return html`<form method=post enctype=multipart/form-data>
            <input type=file name=doc>
            <input type=submit value=Upload>
        </form>`;
    }

    async POST(args: WebArguments) {
        const docField = (await args.body<MultiPartData>())[FIELDS][0];
        const fileName = new ContentDisposition(docField.headers['content-disposition']).filename;
        const fileInfo = docField.value instanceof URI ? await docField.value.info() : String(docField.value);

        return `The uploaded file ${fileName} is ${fileInfo.length} bytes long!`;
    }
})).start();
```

[^1]: This parser is primarily for `message/rfc822` (E-mail) messages, but can actually handle most other `message`
      subtypes too (not `message/http`, though).
[^2]: This parser handles MIME multi-part messages as well as `multipart/form-data`, used by web forms.

[enctype]:           https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/enctype
[StringParser]:      ../api/classes/divine_uri.StringParser.md
[FormParser]:        ../api/classes/divine_uri.FormParser.md
[MessageParser]:     ../api/classes/divine_uri.MessageParser.md
[MultiPartParser]:   ../api/classes/divine_uri.MultiPartParser.md
[load]:              ../api/classes/divine_uri.URI.md#load
[remove]:            ../api/classes/divine_uri.URI.md#remove
[FIELDS]:            ../api/modules/divine_uri.md#fields
[WithFields]:        ../api/interfaces/divine_uri.WithFields.md
[WebArguments.body]: ../api/classes/divine_web_service.WebArguments#body
