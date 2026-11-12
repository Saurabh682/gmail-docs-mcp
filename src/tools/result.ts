import { isDomainError } from '../errors.js';

export function formatSuccessResult(data: Record<string, any>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

export function formatErrorResult(error: unknown) {
  const errObj = isDomainError(error)
    ? error.toJSON()
    : {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      };

  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: errObj }, null, 2),
      },
    ],
    structuredContent: { error: errObj },
  };
}
