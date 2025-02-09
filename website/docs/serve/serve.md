# Handling HTTP Requests

To serve HTTP requests, the Divine Web Service Framework starts with a [WebServer], which accepts the request and
delegates it to a registered [WebService], possibly based on a path prefix. The service is then responsible for finding
a matching [WebResource] based on the request path, and finally calls one of its methods, corresponding to the HTTP
request method. It's also possible to intercept the request with a [WebFilter], which can be used to customize both the
request and the response before and after the resource handler processing.

So here is a small *Hello, World*-like example just to show how some these concepts fit together:

```ts
import { WebArguments, WebResource, WebServer, WebService } from '@divine/web-service';
import { html } from '@divine/x4e';
import '@divine/uri-x4e-parser'; // Activate optional XML & HTML parsers

class HelloResource implements WebResource {
    static path = RegExp('');

    async GET(args: WebArguments) {
        const name = args.string('?name', '');

        return html`<form>
            What's your name? <input name=name value="${name}"> <input type=submit> <br>
            ${name && `Hello, ${name}!`}
        </form>`;
    }
}

(async function main() {
    const service = new WebService(null).addResource(HelloResource);

    console.log(`Visit me at http://localhost:3333/`);
    const server = new WebServer('localhost', 3333, service);
    await server.start({ waitForStop: true });
})();
```

The WSF is more tailored towards building API services than serving browsers with HTML, but as you can see, it can
output markup just fine too — with all parameters properly escaped, naturally.

[WebServer]:   ../api/@divine/web-service/classes/WebServer.md
[WebService]:  ../api/@divine/web-service/classes/WebService.md
[WebResource]: ../api/@divine/web-service/interfaces/WebResource.md
[WebFilter]:   ../api/@divine/web-service/interfaces/WebFilter.md
