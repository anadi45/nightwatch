import { Hono } from 'hono';
import type { InitResponse } from '../../shared/api.js';

export const api = new Hono();

api.get('/init', (c) => {
  const postId = c.req.query('postId') ?? '';
  const username = c.req.query('username') ?? 'anonymous';

  const response: InitResponse = {
    type: 'init',
    postId,
    username,
  };

  return c.json(response);
});
