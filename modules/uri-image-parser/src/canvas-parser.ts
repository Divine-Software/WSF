import { BufferParser, Parser, ParserError } from '@divine/uri';
import { Canvas, Image } from 'canvas';

export class ImageParser extends Parser {
    async parse(stream: AsyncIterable<Buffer>): Promise<Canvas> {
        const image  = new Image();
        await new Promise<void>(async (resolve, reject) => {
            image.onload  = () => resolve();
            image.onerror = (err) => reject(new ParserError('Failed to parse image.', err));
            image.src     = await new BufferParser(this.contentType).parse(stream);
        });

        const canvas = new Canvas(image.height, image.width);
        const ctx    = canvas.getContext('2d');

        if (ctx) {
            ctx.drawImage(image, 0, 0, image.width, image.height);
            return canvas;
        }
        else {
            throw new ParserError('Failed to get a CanvasRenderingContext2D from Canvas.', undefined, canvas);
        }
    }

    async *serialize(data: string[][] | object[]): AsyncIterable<Buffer> {
        this._assertSerializebleData(Array.isArray(data), data);
        yield Buffer.from('');
    }
}
