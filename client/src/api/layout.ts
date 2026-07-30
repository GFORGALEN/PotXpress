import {
  layoutSchema,
  saveLayoutInputSchema,
  saveLayoutResultSchema,
  type Layout,
  type SaveLayoutInput,
  type SaveLayoutResult,
} from '@potxpress/contracts';
import {
  getApiData,
  putApiData,
} from './typedClient.js';

export interface LayoutRequestOptions {
  signal?: AbortSignal;
}

export function getLayout(
  storeId: string,
  { signal }: LayoutRequestOptions = {},
): Promise<Layout> {
  return getApiData(
    `/stores/${storeId}/layout`,
    layoutSchema,
    signal ? { signal } : undefined,
  );
}

export function saveLayout(
  storeId: string,
  payload: SaveLayoutInput,
): Promise<SaveLayoutResult> {
  const validatedPayload = saveLayoutInputSchema.parse(payload);
  return putApiData(
    `/stores/${storeId}/layout`,
    validatedPayload,
    saveLayoutResultSchema,
  );
}
