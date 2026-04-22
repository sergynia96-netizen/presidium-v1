/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { Hono } from 'hono';

import { cleanupExpiredStories } from '../cron/cleanup-stories.js';

const cronRouter = new Hono();

cronRouter.post('/cleanup-stories', async (c) => {
  const internalSecret = process.env.INTERNAL_CRON_SECRET;
  if (internalSecret) {
    const authHeader = c.req.header('authorization') || c.req.header('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

    if (!token || token !== internalSecret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  const result = await cleanupExpiredStories();
  return c.json(result);
});

export default cronRouter;
