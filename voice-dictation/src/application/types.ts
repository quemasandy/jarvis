/**
 * Result Pattern for functional error handling
 * No exceptions in domain layer - use Result types instead
 */

// Discriminated union for Result type
export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly _tag: 'Success';
  readonly value: T;
}

export interface Failure<E> {
  readonly _tag: 'Failure';
  readonly error: E;
}

// Constructors
export const Ok = <T>(value: T): Success<T> => ({
  _tag: 'Success',
  value,
});

export const Err = <E>(error: E): Failure<E> => ({
  _tag: 'Failure',
  error,
});

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is Success<T> => result._tag === 'Success';

export const isErr = <T, E>(result: Result<T, E>): result is Failure<E> =>
  result._tag === 'Failure';

// Functor: map over the success value
export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  isOk(result) ? Ok(fn(result.value)) : result;

// Monad: flatMap/chain for composing operations
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => (isOk(result) ? fn(result.value) : result);

// Map over the error
export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
  isErr(result) ? Err(fn(result.error)) : result;

// Unwrap with default value
export const getOrElse = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  isOk(result) ? result.value : defaultValue;

// Unwrap or throw (use only at boundaries)
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
};

// Match/fold pattern
export const match = <T, E, U>(
  result: Result<T, E>,
  handlers: {
    readonly onSuccess: (value: T) => U;
    readonly onFailure: (error: E) => U;
  }
): U => (isOk(result) ? handlers.onSuccess(result.value) : handlers.onFailure(result.error));

// Convert Promise to Result
export const fromPromise = async <T>(promise: Promise<T>): Promise<Result<T, Error>> => {
  try {
    const value = await promise;
    return Ok(value);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
};

// Combine multiple Results (all must succeed)
export const combine = <T, E>(
  results: ReadonlyArray<Result<T, E>>
): Result<ReadonlyArray<T>, E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
};

// Application-specific error types
export interface DictationError {
  readonly code: DictationErrorCode;
  readonly message: string;
  readonly cause?: Error;
}

export type DictationErrorCode =
  | 'AUDIO_RECORDING_FAILED'
  | 'AUDIO_RECORDING_START_FAILED'
  | 'AUDIO_RECORDING_STOP_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'TRANSLATION_FAILED'
  | 'TEXT_INJECTION_FAILED'
  | 'TEXT_PROCESSING_FAILED'
  | 'CONFIG_ERROR'
  | 'SOX_NOT_INSTALLED'
  | 'PERMISSION_DENIED';

// Factory for creating DictationErrors
export const createError = (
  code: DictationErrorCode,
  message: string,
  cause?: Error
): DictationError => ({
  code,
  message,
  cause,
});

// Type alias for domain-specific Result
export type DictationResult<T> = Result<T, DictationError>;
