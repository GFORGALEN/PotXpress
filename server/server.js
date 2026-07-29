import { pathToFileURL } from 'node:url';
import { createApp } from './src/app.js';
import { config, validateRuntimeConfig } from './src/config.js';
import { checkDataConsistency } from './src/storage/consistencyChecker.js';
import { initializeDemoData } from './src/storage/dataInitializer.js';
import { fileStore } from './src/storage/fileStore.js';
import { instanceLock } from './src/storage/instanceLock.js';
import { runMigrations } from './src/storage/migrations.js';

let httpServer = null;
let shutdownPromise = null;

export async function startServer() {
  if (httpServer) {
    return httpServer;
  }

  try {
    validateRuntimeConfig();
    await instanceLock.acquire();
    await fileStore.initStorage();
    await fileStore.recoverTransactions();
    await runMigrations();
    await initializeDemoData();
    await checkDataConsistency();

    const app = createApp();
    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(config.port, () => resolve(server));
      server.once('error', reject);
    });

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(`PotXpress API 已启动：http://127.0.0.1:${port}`);
    return httpServer;
  } catch (error) {
    await instanceLock.release().catch(() => {});
    throw error;
  }
}

export async function stopServer() {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    if (httpServer) {
      const serverToClose = httpServer;
      httpServer = null;
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

    await fileStore.drain();
    await instanceLock.release();
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
