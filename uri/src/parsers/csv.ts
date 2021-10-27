
import iconv from 'iconv-lite';
import * as Papa from 'papaparse';
import { Readable } from 'stream';
import { Parser, ParserError } from '../parsers';

// See https://tools.ietf.org/html/rfc4180

export class CSVParser extends Parser {
    parse(stream: AsyncIterable<Buffer>): Promise<string[][] | object[]> {
        return new Promise((resolve, reject) => {
            const charset   = this.contentType.param('charset',     'utf8');
            const header    = this.contentType.param('header',      'absent');
            const eol       = this.contentType.param('x-eol',       '');
            const separator = this.contentType.param('x-separator', '');
            const quote     = this.contentType.param('x-quote',     '"');

            Papa.parse<string[] | object>(Readable.from(stream), {
                encoding:  charset, // TODO: Encoding
                header:    header === 'present',
                newline:   eol as '\r' | '\n' | '\r\n',
                delimiter: separator,
                quoteChar: quote,

                beforeFirstChunk: (chunk) => {
                    return chunk.charCodeAt(0) === 0xFEFF /* BOM */ ? chunk.substr(1) : undefined;
                },

                error: (error) => {
                    reject(new ParserError(error.message, error));
                },

                complete: (result) => {
                    resolve(result.data);
                }
            });
        });
    }

    async *serialize(data: string[][] | object[]): AsyncIterable<Buffer> {
        this._assertSerializebleData(Array.isArray(data), data);

        const charset   = this.contentType.param('charset',     'utf8');
        const header    = this.contentType.param('header',      'absent');
        const bom       = this.contentType.param('x-bom',       'absent');
        const eol       = this.contentType.param('x-eol',       '\r\n');
        const separator = this.contentType.param('x-separator', this.contentType.type === 'text/csv' ? ',' : '\t');
        const quote     = this.contentType.param('x-quote',     '"');
        const escape    = this.contentType.param('x-escape',    quote);

        const search    = quote === '' ? separator : quote;
        const replace   = escape + search;
        let   fields    = null;

        function convertRow(row: Iterable<unknown>): Buffer {
            const line: string[] = [];

            for (const column of row as Iterable<unknown>) {
                line.push(column === null || column === undefined ? '' : quote + String(column).replace(search, replace) + quote);
            }

            return iconv.encode(line.join(separator) + eol, charset);
        }

        if (bom === 'present') {
            yield iconv.encode('', charset, { addBOM: true });
        }

        for (let row of data) {
            this._assertSerializebleData(Array.isArray(row) || typeof row === 'object', row);

            if (!Array.isArray(row)) {
                if (!fields) {
                    fields = Object.keys(row);

                    if (header === 'present') {
                        yield convertRow(fields);
                    }
                }

                row = fields.map((key) => (row as never)[key]);
            }

            yield convertRow(row as Iterable<unknown>);
        }
    }
}

Parser
    .register('text/csv',                   CSVParser)
    .register('text/tab-separated-values',  CSVParser)
    .register('text/tsv' /* Unofficial */,  CSVParser)
;
