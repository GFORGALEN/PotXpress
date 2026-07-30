import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { getStoreEventVersion } from './realtimeEvent.js';

export async function readStoreRealtimeVersion(storeId) {
  return unitOfWorkRepository.run(
    {
      resources: ['realtimeEvents'],
      writeOrder: [],
    },
    ({ realtimeEvents }) => getStoreEventVersion(realtimeEvents, storeId),
  );
}
