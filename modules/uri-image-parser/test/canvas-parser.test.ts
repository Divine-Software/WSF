import { toAsyncIterable } from '@divine/commons';
import { ImageParser } from '../src';
import { Canvas } from 'canvas';
import { ParserError } from '@divine/uri';

describe('ImageParser', () => {
  it('should parse an image buffer into a canvas', async () => {
    const parser = new ImageParser('image/png');
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUAAACnej3aAAAADElEQVQImWNgIA0AAAAwAAFDlLdnAAAAAElFTkSuQmCC', 'base64');
    const canvas = await parser.parse(toAsyncIterable(buffer));

    expect(canvas).toBeInstanceOf(Canvas);
    expect(canvas.width).toBe(16);
    expect(canvas.height).toBe(16);
  });

  it('should throw an error if the image buffer is invalid', async () => {
    const parser = new ImageParser('image/png');
    const buffer = Buffer.from('invalid-image-buffer');
    await expect(parser.parse(toAsyncIterable(buffer))).rejects.toThrow(ParserError);
  });
});
