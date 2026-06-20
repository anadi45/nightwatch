import { Hono } from 'hono';

export const forms = new Hono();

forms.post('/example-submit', async (c) => {
  return c.json({ success: true });
});
