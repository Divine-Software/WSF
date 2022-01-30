---
sidebar_label: Web Forms, MIME Messages
sidebar_position: 3
---

# Web Forms and MIME Messages

TBD.

Format        | Main Media Type                     | Parser
--------------|-------------------------------------|------------------
HTML forms    | `application/x-www-form-urlencoded` | [FormParser]
MIME messages | `message/*`[^1]                     | [MessageParser]
Text          | `multipart/*`[^2]                   | [MultiPartParser]

[^1]: This parser is primarily for `message/rfc822` (E-mail) messages, but can actually handle most other `message`
      subtypes too (not `message/http`, though).
[^2]: This parser handles MIME multi-part messages as well as `multipart/form-data`, used by web forms.

[FormParser]:      ../api/classes/divine_uri.FormParser.md
[MessageParser]:   ../api/classes/divine_uri.MessageParser.md
[MultiPartParser]: ../api/classes/divine_uri.MultiPartParser.md
