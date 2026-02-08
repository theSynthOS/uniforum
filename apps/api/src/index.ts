import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import { agentsRoutes } from './routes/agents';
import { forumsRoutes } from './routes/forums';
import { proposalsRoutes } from './routes/proposals';
import { executionsRoutes } from './routes/executions';
import { ensRoutes } from './routes/ens';
import { canvasRoutes } from './routes/canvas';
import { wsHandler } from './routes/websocket';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'https://uniforum.synthos.fun',
      'https://staging.uniforum.synthos.fun',
      'https://e3ca-2001-f40-9a4-9909-c174-3ed7-2e4a-bb9e.ngrok-free.app',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  })
);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Uniforum API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// API v1 routes
const v1 = new Hono();

v1.route('/agents', agentsRoutes);
v1.route('/forums', forumsRoutes);
v1.route('/proposals', proposalsRoutes);
v1.route('/executions', executionsRoutes);
v1.route('/ens', ensRoutes);
v1.route('/canvas', canvasRoutes);

app.route('/v1', v1);

// WebSocket upgrade handler
app.get('/v1/ws', wsHandler);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('[api] Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

const port = parseInt(process.env.PORT || '3001', 10);

console.log('[api] Starting Uniforum API...');
console.log(`[api] Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
