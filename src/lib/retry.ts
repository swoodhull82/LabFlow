
'use client';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
  context?: string;
  signal?: AbortSignal; // As indicated by error log (line 9)
}

// Type for DEFAULT_RETRY_OPTIONS, ensuring all properties from RetryOptions (except onRetry and signal which are optional) are present.
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal'>> & { onRetry?: RetryOptions['onRetry']; signal?: RetryOptions['signal'] } = {
  maxAttempts: 4,
  delayMs: 1000, // Comma added here
  shouldRetry: (error: any) => { // Structure from error log (line 12-25)
    if (error && typeof error === 'object') {
      // Prioritize abort signal checks
      if (error.isAbort === true || (typeof error.message === 'string' && error.message.toLowerCase().includes('aborted'))) {
        return false;
      }
      // Do not retry circuit open errors immediately if such logic exists
      if (error.isCircuitOpenError === true || error.circuitJustOpened === true) {
        return false;
      }
      // Retry on network errors (status 0) or common transient server errors
      return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
    }
    return false;
  },
  context: 'operation', // From error log (line 26)
  // signal: undefined, // From error log (line 27), can remain commented or be omitted as it's optional
};

export async function withRetry<T>(
  asyncFn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // If asyncFn is a PocketBase SDK call, it usually takes an options object
      // where the signal can be passed. The current signature of asyncFn doesn't
      // directly take opts.signal, but it's assumed to be used within asyncFn if needed.
      return await asyncFn();
    } catch (error: any) {
      lastError = error;

      // Explicitly check signal before deciding to retry
      // This complements the error.isAbort check within shouldRetry
      if (opts.signal && opts.signal.aborted) {
        // console.warn(`Operation for ${opts.context} aborted by signal. Not retrying.`);
        throw error;
      }
      
      if (opts.shouldRetry(error)) {
        if (opts.onRetry) {
          opts.onRetry(attempt, error);
        }
        if (attempt < opts.maxAttempts) {
          const delay = opts.delayMs * Math.pow(2, attempt - 1);
          console.warn(`Attempt ${attempt} failed for ${opts.context}. Retrying in ${delay}ms... Error: ${error.message || JSON.stringify(error)}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.warn(`All ${opts.maxAttempts} attempts failed for ${opts.context}. Last error: ${error.message || JSON.stringify(error)}`);
        }
      } else {
        // If error is not retryable or signal was aborted (caught by shouldRetry or explicit check)
        throw error;
      }
    }
  }
  // If all attempts failed for retryable errors
  throw lastError;
}
