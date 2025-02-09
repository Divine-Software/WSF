
import iconv from 'iconv-lite';
import * as Papa from 'papaparse';
import { Readable } from 'stream';
import { Parser, ParserError } from '../parsers';

// See https://tools.ietf.org/html/rfc4180

/**
 * The `text/csv`, `text/tab-separated-values` and `text/tsv` parser handles tabular, delimited text files where each
 * record is stored in a separate line and where each field in the record (usually) is separated by a comma or tab
 * character.
 *
 * The format of the parsed data depends on the `header` media type parameter. If `present`, the result will be an array
 * of objects; if `absent`, which is also the default, the result will be an array of string arrays.
 *
 * The following media type parameters are used:
 *
 * Name          | Description
 * --------------|--------------------------------------------------------------------------------------------------------------------------------------------
 * `charset`     | The character set to use. Default is `utf8`.
 * `header`      | Whether the first line contains the name of the columns (if `present`) or not (if `absent`, the default). Affects the parsed data format.
 * `x-bom`       | Whether to add a byte-order-mark (if `present`) or not (if `absent`, the default) when serializing.
 * `x-eol`       | The character or sequence of characters to separate lines/records with. Default is to auto-detect when parsing and `\r\n` when serializing.
 * `x-separator` | The character to separate fields with. Default is to auto-detect when parsing and `,` for `text/csv` and a tab character otherwise.
 * `x-quote`     | The character to surround each field with. Default is `"`.
 * `x-escape`    | THe character to escape the quote character with inside a field. Default is `"`.
 */
export class CSVParser extends Parser {
    parse(stream: AsyncIterable<Buffer>): Promise<string[][] | object[]> {
        return new Promise((resolve, reject) => {
            const charset   = this.contentType.param('charset',     'utf8');
            const header    = this.contentType.param('header',      'absent');
            const eol       = this.contentType.param('x-eol',       '');
            const separator = this.contentType.param('x-separator', '');
            const quote     = this.contentType.param('x-quote',     '"');
            const escape    = this.contentType.param('x-escape',    quote);

            Papa.parse<string[] | object>(Readable.from(stream), {
                encoding:   charset, // TODO: Encoding
                header:     header === 'present',
                newline:    eol as '\r' | '\n' | '\r\n',
                delimiter:  separator,
                quoteChar:  quote,
                escapeChar: escape,

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

            for (const column of row) {
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
