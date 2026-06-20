import { Hono } from 'hono';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  console.log('Nightwatch app installed');
  return c.json({ success: true });
});
