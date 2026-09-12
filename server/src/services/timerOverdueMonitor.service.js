import { timerService } from './timer.service.js';

const DEFAULT_SCAN_INTERVAL_MILLISECONDS = 15_000;

export class TimerOverdueMonitor {
  constructor({
    scanIntervalMilliseconds = DEFAULT_SCAN_INTERVAL_MILLISECONDS,
    processor = () => timerService.processOverdueTimers(),
  } = {}) {
    this.scanIntervalMilliseconds = scanIntervalMilliseconds;
    this.processor = processor;
    this.active = false;
    this.timeout = null;
    this.currentRun = null;
  }

  async runOnce() {
    if (this.currentRun) {
      return this.currentRun;
    }

    this.currentRun = Promise.resolve()
      .then(() => this.processor())
      .catch((error) => {
        console.error(`超时自动处理失败：${error.message}`);
        return null;
      })
      .finally(() => {
        this.currentRun = null;
      });
    return this.currentRun;
  }

  scheduleNext() {
    if (!this.active) {
      return;
    }

    this.timeout = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNext();
    }, this.scanIntervalMilliseconds);
    this.timeout.unref?.();
  }

  async start() {
    if (this.active) {
      return;
    }

    this.active = true;
    await this.runOnce();
    this.scheduleNext();
  }

  async stop() {
    this.active = false;
    clearTimeout(this.timeout);
    this.timeout = null;
    await this.currentRun;
  }
}

export const timerOverdueMonitor = new TimerOverdueMonitor();
