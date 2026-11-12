import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHttpApp, type AppContext } from '../src/http/app.js';

let appPromise: Promise<AppContext> | null = null;

function getApp(): Promise<AppContext> {
  if (!appPromise) {
    appPromise = createHttpApp();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    await app.handleNodeRequest(req, res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: err?.message || 'Serverless execution error.',
          },
        })
      );
    }
  }
}

export { handler };
