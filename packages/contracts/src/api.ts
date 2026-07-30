import { z } from 'zod';

export const apiSuccessSchema = <Schema extends z.ZodType>(schema: Schema) => (
  z.object({
    success: z.literal(true),
    data: schema,
    message: z.string(),
  }).strict()
);

export const apiFailureSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }).strict(),
}).strict();

export interface ApiSuccess<Data> {
  success: true;
  data: Data;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<Data> = ApiSuccess<Data> | ApiFailure;
