
'use client';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: RetryOptions['onRetry'] } = {
  maxAttempts: 3,
  delayMs: 500, 
  shouldRetry: (error: any) => {
    if (error && typeof error === 'object') {
      // Do not retry if the request was explicitly aborted
      if (error.isAbort === true || (typeof error.message === 'string' && error.message.toLowerCase().includes('aborted'))) {
        return false;
      }
      // Retry on network errors (status 0) or common transient server errors
      return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
    }
    return false;
  },
};

export async function withRetry<T>(
  asyncFn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;
      if (opts.shouldRetry(error)) {
        if (opts.onRetry) {
          opts.onRetry(attempt, error);
        }
        if (attempt < opts.maxAttempts) {
          console.warn(`Attempt ${attempt} failed for operation. Retrying in ${opts.delayMs}ms... Error: ${error.message || JSON.stringify(error)}`);
          await new Promise(resolve => setTimeout(resolve, opts.delayMs * Math.pow(2, attempt -1) )); // Exponential backoff
        } else {
          console.error(`All ${opts.maxAttempts} attempts failed for operation. Last error: ${error.message || JSON.stringify(error)}`);
        }
      } else {
        // If error is not retryable, rethrow immediately
        throw error;
      }
    }
  }
  // If all attempts failed for retryable errors
  throw lastError;
}
