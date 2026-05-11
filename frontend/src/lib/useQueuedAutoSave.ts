import { useCallback, useEffect, useRef } from "react";

type UseQueuedAutoSaveOptions<T> = {
  value: T;
  baseline: T;
  enabled?: boolean;
  delayMs?: number;
  isEqual: (left: T, right: T) => boolean;
  save: (value: T) => Promise<void>;
  validate?: (value: T) => string | null;
  onValidationError?: (message: string | null) => void;
  onError?: (error: unknown) => void;
};

type UseQueuedAutoSaveResult = {
  flush: () => Promise<boolean>;
  cancel: () => void;
};

export function useQueuedAutoSave<T>({
  value,
  baseline,
  enabled = true,
  delayMs = 600,
  isEqual,
  save,
  validate,
  onValidationError,
  onError,
}: UseQueuedAutoSaveOptions<T>): UseQueuedAutoSaveResult {
  const lastSavedValueRef = useRef(baseline);
  const latestValueRef = useRef(value);
  const pendingRef = useRef(false);
  const queuedValueRef = useRef<T | null>(null);
  const timeoutIdRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const submit = useCallback(
    async (candidate: T): Promise<boolean> => {
      const validationError = validate?.(candidate) ?? null;
      if (validationError) {
        onValidationError?.(validationError);
        return false;
      }

      onValidationError?.(null);

      if (isEqual(candidate, lastSavedValueRef.current)) {
        return true;
      }

      if (pendingRef.current) {
        queuedValueRef.current = candidate;
        return false;
      }

      pendingRef.current = true;
      let success = false;

      try {
        await save(candidate);
        lastSavedValueRef.current = candidate;
        success = true;
      } catch (error) {
        onError?.(error);
      } finally {
        pendingRef.current = false;
      }

      const queuedCandidate = queuedValueRef.current;
      queuedValueRef.current = null;
      if (queuedCandidate && !isEqual(queuedCandidate, lastSavedValueRef.current)) {
        return submit(queuedCandidate);
      }

      return success;
    },
    [isEqual, onError, onValidationError, save, validate],
  );

  const flush = useCallback(async () => {
    cancel();
    return submit(latestValueRef.current);
  }, [cancel, submit]);

  useEffect(() => {
    lastSavedValueRef.current = baseline;
    queuedValueRef.current = null;

    if (isEqual(latestValueRef.current, baseline)) {
      cancel();
    }
  }, [baseline, cancel, isEqual]);

  useEffect(() => {
    if (!enabled) {
      cancel();
      queuedValueRef.current = null;
      return;
    }

    if (isEqual(value, lastSavedValueRef.current)) {
      cancel();
      return;
    }

    cancel();
    timeoutIdRef.current = window.setTimeout(() => {
      void submit(value);
    }, delayMs);

    return cancel;
  }, [cancel, delayMs, enabled, isEqual, submit, value]);

  useEffect(() => cancel, [cancel]);

  return { flush, cancel };
}
