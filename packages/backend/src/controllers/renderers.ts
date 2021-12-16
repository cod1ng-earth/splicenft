import { RGB } from '@splicenft/common';
import { Request, Response } from 'express';
import Artwork from '../lib/Artwork';
import ImageCallback from '../lib/ImageCallback';
import Render from '../lib/render';
import { StyleCache } from '../lib/StyleCache';

const GRAYSCALE_COLORS: RGB[] = [
  [20, 30, 40],
  [80, 80, 80],
  [100, 100, 100],
  [150, 150, 150],
  [175, 175, 175],
  [200, 200, 200],
  [220, 220, 220],
  [250, 250, 250]
];

export function renderSplice(styleCache: StyleCache) {
  return async (req: Request, res: Response) => {
    const networkId = parseInt(req.params.network);
    const tokenId = req.params.tokenid;
    const cache = styleCache.getCache(networkId);

    if (!cache)
      return res.status(500).send(`network ${networkId} not supported`);
    try {
      await Artwork(cache, tokenId, ImageCallback(res));
    } catch (e: any) {
      console.error(`couldnt create image :( ${e.message}`);
      res.status(500).send(`couldnt create image :( ${e.message}`);
    }
  };
}

export function generic(styleCache: StyleCache) {
  return async (req: Request, res: Response) => {
    const networkId = parseInt(req.params.network);
    const styleTokenId = parseInt(req.params.style_token_id);

    const cache = styleCache.getCache(networkId);
    if (!cache)
      return res.status(500).send(`network ${networkId} not supported`);

    const style = cache.getStyle(styleTokenId);
    if (!style) {
      return res
        .status(404)
        .send(`style ${styleTokenId} not available on network ${networkId}`);
    }
    const renderer = await style.getRenderer();

    try {
      Render(
        renderer,
        {
          colors: GRAYSCALE_COLORS,
          dim: { w: 1500, h: 500 },
          randomness: 1
        },
        ImageCallback(res)
      );
    } catch (e) {
      console.error(e);
      res.status(500).end();
    }
  };
}