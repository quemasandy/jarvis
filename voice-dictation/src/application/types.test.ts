import { describe, it, expect } from 'vitest';
import {
  Ok,
  Err,
  isOk,
  isErr,
  map,
  flatMap,
  mapErr,
  getOrElse,
  unwrap,
  match,
  fromPromise,
  combine,
  createError,
} from './types';

describe('Result Pattern', () => {
  describe('Ok / Err constructors', () => {
    it('creates a Success with Ok', () => {
      const result = Ok(42);
      expect(result._tag).toBe('Success');
      expect(result.value).toBe(42);
    });

    it('creates a Failure with Err', () => {
      const error = new Error('something went wrong');
      const result = Err(error);
      expect(result._tag).toBe('Failure');
      expect(result.error).toBe(error);
    });

    it('handles null and undefined values in Ok', () => {
      expect(Ok(null).value).toBe(null);
      expect(Ok(undefined).value).toBe(undefined);
    });
  });

  describe('Type guards: isOk / isErr', () => {
    it('isOk returns true for Success', () => {
      expect(isOk(Ok('test'))).toBe(true);
      expect(isOk(Err('error'))).toBe(false);
    });

    it('isErr returns true for Failure', () => {
      expect(isErr(Err('error'))).toBe(true);
      expect(isErr(Ok('test'))).toBe(false);
    });
  });

  describe('map', () => {
    it('transforms Success value', () => {
      const result = map(Ok(5), (x) => x * 2);
      expect(isOk(result) && result.value).toBe(10);
    });

    it('passes through Failure unchanged', () => {
      const error = new Error('fail');
      const result = map(Err(error), (x: number) => x * 2);
      expect(isErr(result) && result.error).toBe(error);
    });
  });

  describe('flatMap', () => {
    it('chains successful operations', () => {
      const divide = (a: number, b: number) => (b === 0 ? Err('division by zero') : Ok(a / b));

      const result = flatMap(Ok(10), (x) => divide(x, 2));
      expect(isOk(result) && result.value).toBe(5);
    });

    it('short-circuits on first Failure', () => {
      const result = flatMap(Err('initial error'), () => Ok(42));
      expect(isErr(result) && result.error).toBe('initial error');
    });

    it('returns Failure from inner function', () => {
      const result = flatMap(Ok(10), () => Err('inner error'));
      expect(isErr(result) && result.error).toBe('inner error');
    });
  });

  describe('mapErr', () => {
    it('transforms Failure error', () => {
      const result = mapErr(Err('error'), (e) => `wrapped: ${e}`);
      expect(isErr(result) && result.error).toBe('wrapped: error');
    });

    it('passes through Success unchanged', () => {
      const result = mapErr(Ok(42), (e: string) => `wrapped: ${e}`);
      expect(isOk(result) && result.value).toBe(42);
    });
  });

  describe('getOrElse', () => {
    it('returns value for Success', () => {
      expect(getOrElse(Ok(42), 0)).toBe(42);
    });

    it('returns default for Failure', () => {
      expect(getOrElse(Err('error'), 0)).toBe(0);
    });
  });

  describe('unwrap', () => {
    it('returns value for Success', () => {
      expect(unwrap(Ok('hello'))).toBe('hello');
    });

    it('throws for Failure with Error', () => {
      const error = new Error('test error');
      expect(() => unwrap(Err(error))).toThrow('test error');
    });

    it('throws wrapped Error for non-Error Failure', () => {
      expect(() => unwrap(Err('string error'))).toThrow('string error');
    });
  });

  describe('match', () => {
    it('calls onSuccess for Success', () => {
      const result = match(Ok(5), {
        onSuccess: (v) => `value: ${v}`,
        onFailure: (e) => `error: ${e}`,
      });
      expect(result).toBe('value: 5');
    });

    it('calls onFailure for Failure', () => {
      const result = match(Err('oops'), {
        onSuccess: (v) => `value: ${v}`,
        onFailure: (e) => `error: ${e}`,
      });
      expect(result).toBe('error: oops');
    });
  });

  describe('fromPromise', () => {
    it('converts resolved Promise to Success', async () => {
      const result = await fromPromise(Promise.resolve(42));
      expect(isOk(result) && result.value).toBe(42);
    });

    it('converts rejected Promise to Failure', async () => {
      const result = await fromPromise(Promise.reject(new Error('async error')));
      expect(isErr(result) && result.error.message).toBe('async error');
    });

    it('wraps non-Error rejections', async () => {
      const result = await fromPromise(Promise.reject('string rejection'));
      expect(isErr(result) && result.error.message).toBe('string rejection');
    });
  });

  describe('combine', () => {
    it('combines all Success into array', () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      const combined = combine(results);
      expect(isOk(combined) && combined.value).toEqual([1, 2, 3]);
    });

    it('returns first Failure', () => {
      const results = [Ok(1), Err('error1'), Ok(3), Err('error2')];
      const combined = combine(results);
      expect(isErr(combined) && combined.error).toBe('error1');
    });

    it('handles empty array', () => {
      const combined = combine([]);
      expect(isOk(combined) && combined.value).toEqual([]);
    });
  });
});

describe('DictationError', () => {
  describe('createError', () => {
    it('creates error with code and message', () => {
      const error = createError('TRANSCRIPTION_FAILED', 'API timeout');
      expect(error.code).toBe('TRANSCRIPTION_FAILED');
      expect(error.message).toBe('API timeout');
      expect(error.cause).toBeUndefined();
    });

    it('creates error with cause', () => {
      const cause = new Error('network error');
      const error = createError('AUDIO_RECORDING_FAILED', 'Recording failed', cause);
      expect(error.code).toBe('AUDIO_RECORDING_FAILED');
      expect(error.cause).toBe(cause);
    });
  });
});
