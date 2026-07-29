import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { layoutRouter } from './routes/layout.routes.js';
import { settingRouter } from './routes/setting.routes.js';
import { storeRouter } from './routes/store.routes.js';
import { tableRouter } from './routes/table.routes.js';
import { AppError } from './utils/appError.js';

function corsOrigin(origin, callback) {
  if (!origin || config.corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new AppError(403, 'CORS_FORBIDDEN', '不允许的请求来源'));
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({
    origin: corsOrigin,
    credentials: false,
  }));

  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  }

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/stores', storeRouter);
  app.use('/api/stores/:storeId/tables', tableRouter);
  app.use('/api/stores/:storeId/settings', settingRouter);
  app.use('/api/stores/:storeId/layout', layoutRouter);
  app.use((req, res, next) => {
    next(new AppError(404, 'NOT_FOUND', '接口不存在'));
  });
  app.use(errorHandler);

  return app;
}
