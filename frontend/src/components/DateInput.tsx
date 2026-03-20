import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent,
  forwardRef,
  useEffect,
  useState,
} from "react";

type DateInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "onChange"> & {
  value: string | null | undefined;
  onChange: (value: string) => void;
  onEnter?: () => void;
};

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { className, onBlur, onChange, onEnter, onKeyDown, placeholder, style, value, ...props },
  ref,
) {
  const [displayValue, setDisplayValue] = useState(() => formatIsoDateForDisplay(value));

  useEffect(() => {
    setDisplayValue(formatIsoDateForDisplay(value));
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.target.value;
    const nextDisplayValue = normalizeDateInput(rawValue);
    setDisplayValue(nextDisplayValue);

    if (!nextDisplayValue) {
      onChange("");
      return;
    }

    const parsedIsoDate = parseDateInput(rawValue) ?? parseDateInput(nextDisplayValue);
    if (parsedIsoDate) {
      onChange(parsedIsoDate);
    }
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (!displayValue) {
      onChange("");
      onBlur?.(event);
      return;
    }

    const parsedIsoDate = parseDateInput(displayValue);
    if (parsedIsoDate) {
      setDisplayValue(formatIsoDateForDisplay(parsedIsoDate));
      onChange(parsedIsoDate);
    } else {
      setDisplayValue(formatIsoDateForDisplay(value));
    }

    onBlur?.(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      if (!displayValue) {
        onChange("");
      } else {
        const parsedIsoDate = parseDateInput(displayValue);
        if (parsedIsoDate) {
          setDisplayValue(formatIsoDateForDisplay(parsedIsoDate));
          onChange(parsedIsoDate);
        }
      }

      onEnter?.();
    }

    onKeyDown?.(event);
  }

  function handleSetToday() {
    const now = new Date();
    const todayIsoDate = [
      String(now.getFullYear()).padStart(4, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    setDisplayValue(formatIsoDateForDisplay(todayIsoDate));
    onChange(todayIsoDate);
  }

  return (
    <div className="date-input">
      <button
        className="date-input__today"
        disabled={props.disabled || props.readOnly}
        onClick={handleSetToday}
        type="button"
      >
        Сегодня
      </button>
      <input
        {...props}
        autoComplete="off"
        className={["date-input__field", className].filter(Boolean).join(" ")}
        inputMode="numeric"
        placeholder={placeholder ?? "дд.мм.гггг"}
        ref={ref}
        style={style}
        type="text"
        value={displayValue}
        onBlur={handleBlur}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
});

function normalizeDateInput(rawValue: string): string {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return "";
  }

  const pastedIsoDate = parseIsoDate(trimmedValue);
  if (pastedIsoDate) {
    return formatIsoDateForDisplay(pastedIsoDate);
  }

  const digits = trimmedValue.replace(/\D/g, "").slice(0, 8);
  if (!digits) {
    return "";
  }

  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join(".");
}

function parseDateInput(rawValue: string): string | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsedIsoDate = parseIsoDate(trimmedValue);
  if (parsedIsoDate) {
    return parsedIsoDate;
  }

  const displayMatch = trimmedValue.match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/);
  if (displayMatch) {
    return buildIsoDate(displayMatch[3], displayMatch[2], displayMatch[1]);
  }

  const digits = trimmedValue.replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }

  return buildIsoDate(digits.slice(4, 8), digits.slice(2, 4), digits.slice(0, 2));
}

function parseIsoDate(value: string): string | null {
  const isoMatch = value.match(/^(\d{4})[.\-/ ](\d{1,2})[.\-/ ](\d{1,2})$/);
  if (!isoMatch) {
    return null;
  }

  return buildIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
}

function buildIsoDate(year: string, month: string, day: string): string | null {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (!isValidDateParts(numericYear, numericMonth, numericDay)) {
    return null;
  }

  return [
    String(numericYear).padStart(4, "0"),
    String(numericMonth).padStart(2, "0"),
    String(numericDay).padStart(2, "0"),
  ].join("-");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
  );
}

function formatIsoDateForDisplay(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return value;
  }

  return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
}
