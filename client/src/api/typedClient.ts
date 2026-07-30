import type {
  ApiSuccess,
} from '@potxpress/contracts';
import type {
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { z } from 'zod';
import {
  apiClient,
  sendIdempotentRequest,
} from './client.js';

type SchemaResult<Schema extends z.ZodType> = z.output<Schema>;

interface IdempotentRequest {
  method: string;
  url: string;
  data?: unknown;
}

function parseResponse<Schema extends z.ZodType>(
  response: AxiosResponse<ApiSuccess<unknown>>,
  schema: Schema,
): SchemaResult<Schema> {
  return schema.parse(response.data.data);
}

export async function getApiData<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  config?: AxiosRequestConfig,
): Promise<SchemaResult<Schema>> {
  const response = await apiClient.get<
    ApiSuccess<unknown>,
    AxiosResponse<ApiSuccess<unknown>>
  >(url, config);
  return parseResponse(response, schema);
}

export async function putApiData<Schema extends z.ZodType>(
  url: string,
  data: unknown,
  schema: Schema,
  config?: AxiosRequestConfig,
): Promise<SchemaResult<Schema>> {
  const response = await apiClient.put<
    ApiSuccess<unknown>,
    AxiosResponse<ApiSuccess<unknown>>
  >(url, data, config);
  return parseResponse(response, schema);
}

export async function sendIdempotentApiData<
  Schema extends z.ZodType,
>(
  request: IdempotentRequest,
  schema: Schema,
): Promise<SchemaResult<Schema>> {
  const response = await sendIdempotentRequest(request) as AxiosResponse<
    ApiSuccess<unknown>
  >;
  return parseResponse(response, schema);
}
