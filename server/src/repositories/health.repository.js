import { fileStore } from '../storage/fileStore.js';

class HealthRepository {
  getStorageStatus() {
    return fileStore.getStatus();
  }
}

export const healthRepository = new HealthRepository();
