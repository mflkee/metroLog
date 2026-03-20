import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";

import { ru } from "date-fns/locale";
import { DayPicker } from "react-day-picker";

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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => parseIsoDateToDate(value) ?? new Date());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedDate = parseIsoDateToDate(value ?? parseDateInput(displayValue));

  useEffect(() => {
    setDisplayValue(formatIsoDateForDisplay(value));
  }, [value]);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }
    setCalendarMonth(selectedDate ?? new Date());
  }, [calendarOpen, selectedDate]);

  useEffect(() => {
    if (!calendarOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setCalendarOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setCalendarOpen(false);
      inputRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [calendarOpen]);

  function assignInputRef(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof ref === "function") {
      ref(node);
      return;
    }
    if (ref) {
      ref.current = node;
    }
  }

  function commitDisplayValue(rawValue: string) {
    const parsedIsoDate = parseDateInput(rawValue);
    if (parsedIsoDate) {
      const nextDisplayValue = formatIsoDateForDisplay(parsedIsoDate);
      setDisplayValue(nextDisplayValue);
      onChange(parsedIsoDate);
      return parsedIsoDate;
    }

    if (!rawValue.trim()) {
      setDisplayValue("");
      onChange("");
      return "";
    }

    return null;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDisplayValue = sanitizeDateInput(event.target.value);
    setDisplayValue(nextDisplayValue);

    if (!nextDisplayValue.trim()) {
      onChange("");
      return;
    }

    const parsedIsoDate = parseDateInput(nextDisplayValue);
    if (parsedIsoDate) {
      onChange(parsedIsoDate);
    }
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const nextFocusedNode = event.relatedTarget;
    if (nextFocusedNode && containerRef.current?.contains(nextFocusedNode)) {
      onBlur?.(event);
      return;
    }

    const committed = commitDisplayValue(displayValue);
    if (committed === null) {
      setDisplayValue(formatIsoDateForDisplay(value));
    }

    setCalendarOpen(false);
    onBlur?.(event);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      const committed = commitDisplayValue(displayValue);
      if (committed !== null || !displayValue.trim()) {
        onEnter?.();
      }
    }

    if (event.key === "ArrowDown" && (event.altKey || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setCalendarOpen(true);
    }

    if (event.key === "Escape" && calendarOpen) {
      event.preventDefault();
      setCalendarOpen(false);
    }

    onKeyDown?.(event);
  }

  function handleSetToday() {
    const todayIsoDate = formatDateObjectToIso(new Date());
    setDisplayValue(formatIsoDateForDisplay(todayIsoDate));
    onChange(todayIsoDate);
    setCalendarOpen(false);
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) {
      return;
    }
    const isoDate = formatDateObjectToIso(date);
    setDisplayValue(formatIsoDateForDisplay(isoDate));
    onChange(isoDate);
    setCalendarMonth(date);
    setCalendarOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="date-input" ref={containerRef}>
      <button
        className="date-input__today"
        disabled={props.disabled || props.readOnly}
        onClick={handleSetToday}
        type="button"
      >
        Сегодня
      </button>

      <div className="date-input__field-wrap">
        <input
          {...props}
          autoComplete="off"
          className={["date-input__field", className].filter(Boolean).join(" ")}
          inputMode="numeric"
          placeholder={placeholder ?? "дд.мм.гггг"}
          ref={assignInputRef}
          style={style}
          type="text"
          value={displayValue}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <button
          aria-expanded={calendarOpen}
          aria-label="Открыть календарь"
          className="date-input__calendar-toggle"
          disabled={props.disabled || props.readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setCalendarOpen((current) => !current)}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3.75" y="5.75" width="16.5" height="14.5" rx="2.25" />
            <path strokeLinecap="round" d="M7.5 3.75v4M16.5 3.75v4M3.75 9.5h16.5" />
          </svg>
        </button>

        {calendarOpen ? (
          <div
            className="date-input__popover"
            onMouseDown={(event) => event.preventDefault()}
          >
            <DayPicker
              className="date-picker"
              classNames={{
                root: "date-picker__root",
                months: "date-picker__months",
                month: "date-picker__month",
                month_caption: "date-picker__caption",
                caption_label: "date-picker__caption-label",
                nav: "date-picker__nav",
                button_previous: "date-picker__nav-button",
                button_next: "date-picker__nav-button",
                chevron: "date-picker__chevron",
                month_grid: "date-picker__grid",
                weekdays: "date-picker__weekdays",
                weekday: "date-picker__weekday",
                day: "date-picker__day",
                day_button: "date-picker__day-button",
                today: "date-picker__day--today",
                selected: "date-picker__day--selected",
                outside: "date-picker__day--outside",
                disabled: "date-picker__day--disabled",
              }}
              locale={ru}
              mode="single"
              month={calendarMonth}
              selected={selectedDate ?? undefined}
              showOutsideDays
              onMonthChange={setCalendarMonth}
              onSelect={handleCalendarSelect}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

function sanitizeDateInput(rawValue: string): string {
  const trimmedValue = rawValue.replace(/[^\d./\- ]+/g, "");
  if (!trimmedValue.trim()) {
    return "";
  }

  const parsedIsoDate = parseIsoDate(trimmedValue.trim());
  if (parsedIsoDate) {
    return formatIsoDateForDisplay(parsedIsoDate);
  }

  if (/^\d+$/.test(trimmedValue.trim())) {
    const digits = trimmedValue.trim().slice(0, 8);
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return [day, month, year].filter(Boolean).join(".");
  }

  return trimmedValue
    .replace(/[/\- ]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .slice(0, 10);
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

function parseIsoDateToDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return null;
  }

  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);

  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function formatDateObjectToIso(value: Date): string {
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
