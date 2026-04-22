import { Hono } from 'hono';

import { authMiddleware } from '../middleware/auth.js';
import { generateUploadUrl } from '../services/minio.js';

const mediaRouter = new Hono();

mediaRouter.get('/upload-url', authMiddleware, async (c) => {
  const key = c.req.query('key');

  if (!key || !key.match(/^[\w\-\/.]+$/)) {
    return c.json({ success: false, error: 'INVALID_KEY' }, 400);
  }

  const url = await generateUploadUrl(key, 300);
  return c.json({ success: true, url, key });
});

export default mediaRouter;
