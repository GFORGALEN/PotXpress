import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createApp } from './src/app.js';
import { config, validateRuntimeConfig } from './src/config.js';
import { checkDataConsistency } from './src/storage/consistencyChecker.js';
import {
  initializeBootstrapAdmin,
  initializeDemoData,
} from './src/storage/dataInitializer.js';
import { databaseStore } from './src/storage/databaseStore.js';
import { kioskRepository } from './src/repositories/kiosk.repository.js';
import { realtimeHub } from './src/realtime/realtimeHub.js';
import { timerService } from './src/services/timer.service.js';

let httpServer = null;
let shutdownPromise = null;

export async function startServer() {
  if (httpServer) {
    return httpServer;
  }

  try {
    validateRuntimeConfig();
    await databaseStore.initStorage();
    await initializeDemoData();
    await initializeBootstrapAdmin();
    await checkDataConsistency();
    await kioskRepository.syncKeyHashes();

    const app = createApp();
    const candidateServer = http.createServer(app);
    realtimeHub.attach(candidateServer);
    httpServer = await new Promise((resolve, reject) => {
      candidateServer.listen(config.port, () => resolve(candidateServer));
      candidateServer.once('error', reject);
    });

    timerService.startOverdueSweeper(config.overdueSweepIntervalMilliseconds);

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(`PotXpress API 已启动：http://127.0.0.1:${port}`);
    return httpServer;
  } catch (error) {
    await realtimeHub.close().catch(() => {});
    throw error;
  }
}

export async function stopServer() {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    timerService.stopOverdueSweeper();
    if (httpServer) {
      const serverToClose = httpServer;
      httpServer = null;
      await realtimeHub.close();
      await new Promise((resolve, reject) => {
        serverToClose.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    await timerService.waitForSettlements();
    await databaseStore.drain();
    shutdownPromise = null;
  })();

  return shutdownPromise;
}

function installSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      try {
        await stopServer();
        process.exitCode = 0;
      } catch (error) {
        console.error('服务停止失败：', error);
        process.exitCode = 1;
      }
    });
  }
}

const isEntryPoint = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  installSignalHandlers();
  startServer().catch((error) => {
    console.error('PotXpress API 启动失败：', error);
    process.exitCode = 1;
  });
}
