import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { layoutRouter } from './routes/layout.routes.js';
import {
  auditLogRouter,
  recordRouter,
} from './routes/record.routes.js';
import { settingRouter } from './routes/setting.routes.js';
import { storeRouter } from './routes/store.routes.js';
import { tableRouter } from './routes/table.routes.js';
import { tableGroupRouter } from './routes/tableGroup.routes.js';
import {
  tableTimerRouter,
  timerListRouter,
} from './routes/timer.routes.js';
import { userRouter } from './routes/user.routes.js';
import { AppError } from './utils/appError.js';

function requestOrigin(req) {
  const forwardedProtocol = req.get('X-Forwarded-Proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = req.get('X-Forwarded-Host')
    ?.split(',')[0]
    ?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get('Host');

  return host ? `${protocol}://${host}` : null;
}

function corsOptions(req, callback) {
  const origin = req.get('Origin');
  const allowed = !origin
    || origin === requestOrigin(req)
    || config.corsOrigins.includes(origin);

  if (!allowed) {
    callback(new AppError(403, 'CORS_FORBIDDEN', '不允许的请求来源'));
    return;
  }

  callback(null, {
    origin: Boolean(origin),
    credentials: false,
  });
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors(corsOptions));

  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  }

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/stores', storeRouter);
  app.use('/api/stores/:storeId/tables', tableRouter);
  app.use('/api/stores/:storeId/table-groups', tableGroupRouter);
  app.use('/api/stores/:storeId/settings', settingRouter);
  app.use('/api/stores/:storeId/layout', layoutRouter);
  app.use('/api/stores/:storeId/timers', timerListRouter);
  app.use(
    '/api/stores/:storeId/tables/:tableId/timer',
    tableTimerRouter,
  );
  app.use('/api/stores/:storeId/records', recordRouter);
  app.use('/api/stores/:storeId/audit-logs', auditLogRouter);
  app.use('/api', (req, res, next) => {
    next(new AppError(404, 'NOT_FOUND', '接口不存在'));
  });

  if (config.isProduction) {
    const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientDirectory = path.resolve(sourceDirectory, '../../client/dist');

    if (!fs.existsSync(path.join(clientDirectory, 'index.html'))) {
      throw new Error(`生产构建不存在：${clientDirectory}。请先运行客户端构建。`);
    }

    app.use(express.static(clientDirectory));
    app.use((req, res, next) => {
      const acceptsHtml = (req.get('Accept') ?? '')
        .split(',')
        .some((type) => type.trim().split(';')[0] === 'text/html');
      if (
        (req.method === 'GET' || req.method === 'HEAD')
        && acceptsHtml
      ) {
        return res.sendFile(path.join(clientDirectory, 'index.html'));
      }

      return next(new AppError(404, 'NOT_FOUND', '资源不存在'));
    });
  } else {
    app.use((req, res, next) => {
      next(new AppError(404, 'NOT_FOUND', '资源不存在'));
    });
  }
  app.use(errorHandler);

  return app;
}
