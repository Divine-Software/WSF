/* eslint-disable jsdoc/require-jsdoc */

import { Encoder, Parser } from '@divine/uri';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import { WebService, WebServiceConfig } from '../src';
import { WebRequest } from '../src/request';

export function fakedReq(method: string, url: string, headers?: IncomingHttpHeaders, payload?: Buffer) {
    return new WebRequest({
        webServiceConfig: {
            console,
            errorMessageProperty: 'message',
            slowRequestThreshold: 1_000,
            logRequestID:         true,
            maxContentLength:     1_000_000,
            payloadEncoder:       Encoder,
            payloadParser:        Parser,
            trustRequestID:       null,
            trustForwardedFor:    false,
            trustForwardedHost:   false,
            trustForwardedProto:  false,
            trustMethodOverride:  false,
            returnRequestID:      null,
        } satisfies WebServiceConfig,
    } as unknown as WebService<unknown>, {
        method, url,
        headers: {
            host: 'localhost',
            ...headers
        },
        socket: {
            remoteAddress: 'remote:9999',
        },
        [Symbol.asyncIterator]: async function* () {
            if (payload) {
                yield payload;
            }
        },
    } as IncomingMessage);
}
