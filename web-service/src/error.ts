import { WebResponse, WebResponseHeaders } from './response';

/**
 * An Error subclass representing an HTTP response.
 *
 * In addition to the error message, an [[WebStatus | HTTP status code]] and—optionally—one or more custom response
 * headers can be associated with the error.
 *
 * When caught by a [[WebService]], an HTTP response will be constructed from it by invoking its [[toWebResponse]]
 * method.
 */
export class WebError extends Error {
    /**
     * Constructs an HTTP error/status response.
     *
     * @param status   The HTTP status.
     * @param message  An error message.
     * @param headers  Optional custom headers to send to the client.
     */
    constructor(public status: WebStatus, message: string, public headers: WebResponseHeaders = {}) {
        super(message);
    }

    /** Converts this WebError to a string. */
    override toString(): string {
        return `[${this.constructor.name}: ${this.status} ${WebStatus[this.status] || '<Unknown>'} ${this.message}]`;
    }

    /**
     * Converts this WebError to a [[WebResponse]].
     *
     * By default, a JSON-ish object will be returned with a single property specified by the [[errorMessageProperty]]
     * parameter holding the error message. However, subclasses are free to override this method to provide custom error
     * responses. (Alternatively, [[WebService.setErrorHandler]] can be used to provide per-service customization of any
     * kind of errors/exceptions.)
     *
     * @param errorMessageProperty The name
     * @returns A [[WebResponse]] to be sent back to the client.
     */
    toWebResponse(errorMessageProperty: string): WebResponse {
        return new WebResponse(this.status, { [errorMessageProperty]: this.message }, this.headers);
    }
}

/**
 * An enumeration of all known HTTP status codes.
 *
 * See [HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) at MDN for more information.
 */
export enum WebStatus {
    /** This interim response indicates that the client should continue the request or ignore the response if the request is already finished. */
    CONTINUE                        = 100,

    /** This code is sent in response to an Upgrade request header from the client and indicates the protocol the server is switching to. */
    SWITCHING_PROTOCOLS             = 101,

    /** This code indicates that the server has received and is processing the request, but no response is available yet. */
    PROCESSING                      = 102,

    /** This status code is primarily intended to be used with the Link header, letting the user agent start preloading resources while the server prepares a response. */
    EARLY_HINTS                     = 103,

    /** The request succeeded. */
    OK                              = 200,

    /** The request succeeded, and a new resource was created as a result. This is typically the response sent after POST requests, or some PUT requests. */
    CREATED                         = 201,

    /** The request has been received but not yet acted upon. */
    ACCEPTED                        = 202,

    /** This response code means the returned metadata is not exactly the same as is available from the origin server, but is collected from a local or a third-party copy. */
    NON_AUTHORITATIVE_INFORMATION   = 203,

    /** There is no content to send for this request, but the headers may be useful.  */
    NO_CONTENT                      = 204,

    /** Tells the user agent to reset the document which sent this request. */
    RESET_CONTENT                   = 205,

    /** This response code is used when the Range header is sent from the client to request only part of a resource. */
    PARTIAL_CONTENT                 = 206,

    /** Conveys information about multiple resources, for situations where multiple status codes might be appropriate. */
    MULTI_STATUS                    = 207,

    /** Used inside a <dav:propstat> response element to avoid repeatedly enumerating the internal members of multiple bindings to the same collection. */
    ALREADY_REPORTED                = 208,

    /** The server has fulfilled a GET request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance. */
    IM_USED                         = 226,

    /** The request has more than one possible response. The user agent or user should choose one of them. */
    MULTIPLE_CHOICES                = 300,

    /** The URL of the requested resource has been changed permanently. */
    MOVED_PERMANENTLY               = 301,

    /** This response code means that the URI of requested resource has been changed *temporarily*. */
    FOUND                           = 302,

    /** The server sent this response to direct the client to get the requested resource at another URI with a GET request. */
    SEE_OTHER                       = 303,

    /** This is used for caching purposes. It tells the client that the response has not been modified, so the client can continue to use the same cached version of the response. */
    NOT_MODIFIED                    = 304,

    /**
     * Defined in a previous version of the HTTP specification to indicate that a requested response must be accessed by a proxy.
     *
     * @deprecated since RFC 7231.
     */
    USE_PROXY                       = 305,

    /**
     * The 306 response is generated by a proxy server to indicate that the client or proxy should use the information in the accompanying Set-Proxy header to choose a proxy for subsequent requests.
     *
     * @deprecated since HTTP 1.1 (RFC 2616).
     */
    SWITCH_PROXY                    = 306,

    /** The server sends this response to direct the client to get the requested resource at another URI with same method that was used in the prior request. */
    TEMPORARY_REDIRECT              = 307,

    /** This means that the resource is now permanently located at another URI, specified by the `Location:` HTTP Response header. */
    PERMANENT_REDIRECT              = 308,

    /** The server could not understand the request due to invalid syntax. */
    BAD_REQUEST                     = 400,

    /** Although the HTTP standard specifies "unauthorized", semantically this response means "unauthenticated". That is, the client must authenticate itself to get the requested response. */
    UNAUTHORIZED                    = 401,

    /** This response code is reserved for future use. The initial aim for creating this code was using it for digital payment systems, however this status code is used very rarely and no standard convention exists. */
    PAYMENT_REQUIRED                = 402,

    /** The client does not have access rights to the content; that is, it is unauthorized, so the server is refusing to give the requested resource. */
    FORBIDDEN                       = 403,

    /** The server can not find the requested resource. */
    NOT_FOUND                       = 404,

    /** The request method is known by the server but is not supported by the target resource. */
    METHOD_NOT_ALLOWED              = 405,

    /** This response is sent when the web server, after performing server-driven content negotiation, doesn't find any content that conforms to the criteria given by the user agent. */
    NOT_ACCEPTABLE                  = 406,

    /** This is similar to 401 Unauthorized but authentication is needed to be done by a proxy. */
    PROXY_AUTHENTICATION_REQUIRED   = 407,

    /** This status code indicates that the server did not receive a complete request message within the time that it was prepared to wait. */
    REQUEST_TIMEOUT                 = 408,

    /** This response is sent when a request conflicts with the current state of the server. */
    CONFLICT                        = 409,

    /** This response is sent when the requested content has been permanently deleted from server, with no forwarding address. */
    GONE                            = 410,

    /** Server rejected the request because the `Content-Length` header field is not defined and the server requires it. */
    LENGTH_REQUIRED                 = 411,

    /** The client has indicated preconditions in its headers which the server does not meet. */
    PRECONDITION_FAILED             = 412,

    /** Request entity is larger than limits defined by server. */
    PAYLOAD_TOO_LARGE               = 413,

    /** The URI requested by the client is longer than the server is willing to interpret. */
    URI_TOO_LONG                    = 414,

    /** The media format of the requested data is not supported by the server, so the server is rejecting the request. */
    UNSUPPORTED_MEDIA_TYPE          = 415,

    /** The range specified by the `Range` header field in the request cannot be fulfilled. */
    RANGE_NOT_SATISFIABLE           = 416,

    /** This response code means the expectation indicated by the `Expect` request header field cannot be met by the server. */
    EXPECTATION_FAILED              = 417,

    /** The server refuses the attempt to brew coffee with a teapot. */
    I_AM_A_TEAPOT                   = 418,

    /** The request was directed at a server that is not able to produce a response. */
    MISDIRECTED_REQUEST             = 421,

    /** The request was well-formed but was unable to be followed due to semantic errors. */
    UNPROCESSABLE_ENTITY            = 422,

    /** The resource that is being accessed is locked. */
    LOCKED                          = 423,

    /** The request failed due to failure of a previous request. */
    FAILED_DEPENDENCY               = 424,

    /** Indicates that the server is unwilling to risk processing a request that might be replayed. */
    TOO_EARLY                       = 425,

    /** The server refuses to perform the request using the current protocol but might be willing to do so after the client upgrades to a different protocol. */
    UPGRADE_REQUIRED                = 426,

    /** The origin server requires the request to be conditional. This response is intended to prevent the 'lost update' problem, where a client GETs a resource's state, modifies it and PUTs it back to the server, when meanwhile a third party has modified the state on the server, leading to a conflict. */
    PRECONDITION_REQUIRED           = 428,

    /** The user has sent too many requests in a given amount of time ("rate limiting"). */
    TOO_MANY_REQUESTS               = 429,

    /** The server is unwilling to process the request because its header fields are too large. */
    REQUEST_HEADER_FIELDS_TOO_LARGE = 431,

    /** The user agent requested a resource that cannot legally be provided, such as a web page censored by a government. */
    UNAVAILABLE_FOR_LEGAL_REASONS   = 451,

    /** The server has encountered a situation it does not know how to handle. */
    INTERNAL_SERVER_ERROR           = 500,

    /** The request method is not supported by the server and cannot be handled. */
    NOT_IMPLEMENTED                 = 501,

    /** This error response means that the server, while working as a gateway to get a response needed to handle the request, got an invalid response. */
    BAD_GATEWAY                     = 502,

    /** The server is not ready to handle the request. Common causes are a server that is down for maintenance or that is overloaded. */
    SERVICE_UNAVAILABLE             = 503,

    /** This error response is given when the server is acting as a gateway and cannot get a response in time. */
    GATEWAY_TIMEOUT                 = 504,

    /** The HTTP version used in the request is not supported by the server. */
    HTTP_VERSION_NOT_SUPPORTED      = 505,

    /** The server has an internal configuration error: the chosen variant resource is configured to engage in transparent content negotiation itself, and is therefore not a proper end point in the negotiation process. */
    VARIANT_ALSO_NEGOTIATES         = 506,

    /** The method could not be performed on the resource because the server is unable to store the representation needed to successfully complete the request. */
    INSUFFICIENT_STORAGE            = 507,

    /** The server detected an infinite loop while processing the request. */
    LOOP_DETECTED                   = 508,

    /** Non-standard response code: The server has exceeded the bandwidth specified by the server administrator. */
    BANDWIDTH_LIMIT_EXCEEDED        = 509,

    /** Further extensions to the request are required for the server to fulfill it. */
    NOT_EXTENDED                    = 510,

    /** Indicates that the client needs to authenticate to gain network access. */
    NETWORK_AUTHENTICATION_REQUIRED = 511,
}
