import { Hono } from 'hono';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  return c.json({ success: true });
});
