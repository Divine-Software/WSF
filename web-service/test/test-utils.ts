import { IncomingMessage, IncomingHttpHeaders } from 'http';
import { WebRequest } from '../src/request';

export function fakedReq(method: string, url: string, headers?: IncomingHttpHeaders, payload?: Buffer) {
    return new WebRequest(null!, {
        method, url,
        headers: {
            host: 'localhost',
            ...headers
        },
        socket: {
            remoteAddress: 'remote:9999',
        },
        pipe: (dst: NodeJS.WritableStream) => {
            if (payload) {
                dst.write(payload);
            }

            return dst.end();
        }
    } as IncomingMessage, {
        console,
        errorMessageProperty: 'message',
        slowRequestThreshold: 1_000,
        logRequestID:         true,
        maxContentLength:     1_000_000,
        trustRequestID:       null,
        trustForwardedFor:    false,
        trustForwardedHost:   false,
        trustForwardedProto:  false,
        trustMethodOverride:  false,
        returnRequestID:      null,
    });
}
