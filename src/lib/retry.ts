
'use client';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, maxAttempts: number, error: any) => void;
  context?: string;
  signal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 4, // Increased from 3 in a previous step
  delayMs: 1000,
  shouldRetry: (error: any) => {
    if (error && typeof error === 'object') {
      // Prioritize abort signal checks done explicitly in withRetry
      if (error.isAbort === true || (typeof error.message === 'string' && error.message.toLowerCase().includes('aborted'))) {
        return false;
      }
      // Do not retry circuit open errors immediately
      if (error.isCircuitOpenError === true || error.circuitJustOpened === true) {
        return false;
      }
      // Retry on network errors (status 0) or common server gateway errors
      return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
    }
    return false;
  },
  context: 'operation', // Default context
  // signal: undefined, // Default signal is undefined, can be omitted
  // onRetry: undefined, // Default onRetry is undefined, can be omitted
};

enum CircuitState {
  Closed = "CLOSED",
  Open = "OPEN",
  HalfOpen = "HALF_OPEN",
}

interface CircuitInfo {
  state: CircuitState;
  failures: number;
  openUntil?: number; // Timestamp until which the circuit is open
}

const circuits = new Map<string, CircuitInfo>();
const MAX_CIRCUIT_FAILURES = 1; // Number of full withRetry cycles (all attempts) before opening circuit
const CIRCUIT_OPEN_DURATION_MS = 30000; // 30 seconds

export async function withRetry<T>(
  asyncFn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const context = opts.context!; // context will have a default from DEFAULT_RETRY_OPTIONS

  // Helper to standardize abort error throwing
  const throwAbortError = (messagePrefix: string, originalError?: any) => {
    const message = `[withRetry:${context}] ${messagePrefix}. Circuit: ${circuit.state}.`;
    console.warn(message);
    const abortError = new Error(message);
    (abortError as any).isAbort = true;
    (abortError as any).context = context;
    if (originalError) {
      (abortError as any).originalError = originalError;
    }
    throw abortError;
  };

  if (!circuits.has(context)) {
    circuits.set(context, { state: CircuitState.Closed, failures: 0 });
  }
  const circuit = circuits.get(context)!;

  if (circuit.state === CircuitState.Open) {
    if (Date.now() < (circuit.openUntil || 0)) {
      const openError = new Error(`Circuit for '${context}' is open due to repeated failures. Please try again in a few moments.`);
      (openError as any).isCircuitOpenError = true;
      (openError as any).context = context;
      (openError as any).openUntil = circuit.openUntil;
      throw openError;
    } else {
      circuit.state = CircuitState.HalfOpen;
      circuit.failures = 0;
      circuit.openUntil = undefined;
      console.log(`[withRetry:${context}] Circuit is now HalfOpen. Allowing one attempt.`);
    }
  }

  let lastError: any;
  const attemptsForThisRun = circuit.state === CircuitState.HalfOpen ? 1 : opts.maxAttempts!;

  for (let attempt = 1; attempt <= attemptsForThisRun; attempt++) {
    if (opts.signal?.aborted) {
      throwAbortError(`Aborted before attempt ${attempt}`);
    }

    try {
      const result = await asyncFn();
      if (circuit.state === CircuitState.HalfOpen || circuit.failures > 0 || circuit.state === CircuitState.Open) {
        console.log(`[withRetry:${context}] Circuit is now Closed due to successful attempt (was ${circuit.state}).`);
        circuit.state = CircuitState.Closed;
        circuit.failures = 0;
        circuit.openUntil = undefined;
      }
      return result;
    } catch (error) {
      lastError = error;

      if (opts.signal?.aborted) {
        throwAbortError(`Aborted during/after attempt ${attempt} (caught error: ${error?.message || error})`, error);
      }

      if (error && typeof error === 'object' && (error.isAbort === true || (typeof error.message === 'string' && error.message.toLowerCase().includes('aborted')))) {
        console.warn(`[withRetry:${context}] Caught abort-like error on attempt ${attempt}: ${error.message}. Circuit: ${circuit.state}.`);
        if (!(error as any).isAbort) (error as any).isAbort = true;
        if (!(error as any).context) (error as any).context = context;
        throw error;
      }

      if (opts.shouldRetry!(error)) { // Use non-null assertion as shouldRetry has a default
        if (opts.onRetry) {
          opts.onRetry(attempt, attemptsForThisRun, error);
        }

        if (attempt < attemptsForThisRun) {
          const delay = circuit.state === CircuitState.HalfOpen ? opts.delayMs! : opts.delayMs! * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));

          if (opts.signal?.aborted) {
            throwAbortError(`Aborted during retry delay after attempt ${attempt}`);
          }
        } else {
          console.warn(`[withRetry:${context}] All ${attemptsForThisRun} attempts failed (Circuit: ${circuit.state}). Last error: ${error.message || JSON.stringify(error)}`);

          if (circuit.state === CircuitState.HalfOpen) {
            console.warn(`[withRetry:${context}] Circuit failed in HalfOpen state. Re-opening.`);
            circuit.state = CircuitState.Open;
            circuit.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
            (lastError as any).circuitJustOpened = true;
            (lastError as any).context = context;
          } else if (circuit.state === CircuitState.Closed) {
            circuit.failures++;
            console.log(`[withRetry:${context}] Circuit failure count: ${circuit.failures} (max: ${MAX_CIRCUIT_FAILURES})`);
            if (circuit.failures >= MAX_CIRCUIT_FAILURES) {
              console.warn(`[withRetry:${context}] Circuit reached max failures. Opening circuit.`);
              circuit.state = CircuitState.Open;
              circuit.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
              (lastError as any).circuitJustOpened = true;
              (lastError as any).context = context;
            }
          }
          throw lastError;
        }
      } else {
        throw error;
      }
    }
  }

  if (lastError) throw lastError; // Should be unreachable if loop completes, but good practice
  // This line should ideally not be reached if the loop logic is correct.
  throw new Error(`[withRetry:${context}] Unexpected exit: Max attempts ${attemptsForThisRun} reached without success or explicit error handling.`);
}
