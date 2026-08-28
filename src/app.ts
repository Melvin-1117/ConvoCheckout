import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { catalogRouter } from './routes/catalogRoutes';
import { webhookRouter } from './routes/webhookRoutes';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'ConvoCheckout API',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routers
  app.use('/api', catalogRouter);
  app.use('/api/webhooks', webhookRouter);

  // 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  });

  return app;
}
