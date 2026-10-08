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
  const enabledRef = useRef(enabled);
  const isEqualRef = useRef(isEqual);

  const cancel = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    enabledRef.current = enabled;
    isEqualRef.current = isEqual;
  }, [enabled, isEqual]);

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

  const submitRef = useRef(submit);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Flush a still-pending edit instead of dropping it when the component unmounts
  // (for example when the user navigates away inside the debounce window).
  useEffect(
    () => () => {
      cancel();
      if (enabledRef.current) {
        void submitRef.current(latestValueRef.current);
      }
    },
    [cancel],
  );

  // Warn before a reload or tab close while an edit has not reached the server yet.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!enabledRef.current) {
        return;
      }
      if (isEqualRef.current(latestValueRef.current, lastSavedValueRef.current)) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return { flush, cancel };
}
