import {
  type ClipboardEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
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

const EDITABLE_POSITIONS = [0, 1, 3, 4, 6, 7, 8, 9] as const;
const SLOT_COUNT = EDITABLE_POSITIONS.length;
const MASK_DISPLAY = "__.__.____";

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { className, onBlur, onChange, onEnter, onKeyDown, placeholder, style, value, ...props },
  ref,
) {
  const [slots, setSlots] = useState<string[]>(() => slotsFromIsoDate(value));
  const [focused, setFocused] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => parseIsoDateToDate(value) ?? new Date());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const interactingInsideRef = useRef(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const currentIsoFromSlots = useMemo(() => parseSlotsToIso(slots), [slots]);
  const selectedIsoDate = currentIsoFromSlots ?? value ?? null;
  const selectedDate = useMemo(() => parseIsoDateToDate(selectedIsoDate), [selectedIsoDate]);
  const selectedDateRef = useRef<Date | null>(selectedDate);
  const hasAnyDigits = slots.some(Boolean);
  const displayValue = focused || hasAnyDigits ? formatSlotsForDisplay(slots) : "";

  useEffect(() => {
    setSlots(slotsFromIsoDate(value));
  }, [value]);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }
    setCalendarMonth(selectedDateRef.current ?? new Date());
  }, [calendarOpen]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

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

  useLayoutEffect(() => {
    if (!pendingSelectionRef.current || document.activeElement !== inputRef.current) {
      return;
    }

    const selection = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    inputRef.current?.setSelectionRange(selection.start, selection.end);
  });

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

  function queueCaret(position: number) {
    pendingSelectionRef.current = { start: position, end: position };
  }

  function markInteractingInside() {
    interactingInsideRef.current = true;
    window.setTimeout(() => {
      interactingInsideRef.current = false;
    }, 0);
  }

  function syncExternalValue(nextSlots: string[]) {
    const parsedIsoDate = parseSlotsToIso(nextSlots);
    if (parsedIsoDate) {
      onChange(parsedIsoDate);
      return parsedIsoDate;
    }

    if (!nextSlots.some(Boolean)) {
      onChange("");
      return "";
    }

    return null;
  }

  function replaceSelectionWithDigits(rawDigits: string, start: number, end: number) {
    const digits = rawDigits.replace(/\D/g, "");
    if (!digits) {
      return;
    }

    const nextSlots = [...slots];
    const selectedSlotIndexes = getSelectedSlotIndexes(start, end);
    const insertionStart = selectedSlotIndexes[0] ?? getSlotIndexAtOrAfter(start);
    let slotIndex = insertionStart;

    if (selectedSlotIndexes.length > 0) {
      for (const selectedSlotIndex of selectedSlotIndexes) {
        nextSlots[selectedSlotIndex] = "";
      }
      slotIndex = selectedSlotIndexes[0] ?? slotIndex;
    }

    for (const digit of digits) {
      if (slotIndex >= SLOT_COUNT) {
        break;
      }
      nextSlots[slotIndex] = digit;
      slotIndex += 1;
    }

    setSlots(nextSlots);
    syncExternalValue(nextSlots);
    queueCaret(getDisplayPositionForSlot(Math.min(slotIndex, SLOT_COUNT - 1), slotIndex >= SLOT_COUNT));
  }

  function clearSelectionOrSlot(start: number, end: number, direction: "backspace" | "delete") {
    const nextSlots = [...slots];
    const selectedSlotIndexes = getSelectedSlotIndexes(start, end);

    if (selectedSlotIndexes.length > 0) {
      for (const slotIndex of selectedSlotIndexes) {
        nextSlots[slotIndex] = "";
      }
      setSlots(nextSlots);
      syncExternalValue(nextSlots);
      queueCaret(getDisplayPositionForSlot(selectedSlotIndexes[0]));
      return;
    }

    const slotIndex =
      direction === "backspace"
        ? getSlotIndexBefore(start)
        : getSlotIndexAtOrAfter(start);

    if (slotIndex === null) {
      return;
    }

    nextSlots[slotIndex] = "";
    setSlots(nextSlots);
    syncExternalValue(nextSlots);
    queueCaret(getDisplayPositionForSlot(slotIndex));
  }

  function commitSlots(): string | null {
    const parsedIsoDate = parseSlotsToIso(slots);
    if (parsedIsoDate) {
      const committedSlots = slotsFromIsoDate(parsedIsoDate);
      setSlots(committedSlots);
      onChange(parsedIsoDate);
      return parsedIsoDate;
    }

    if (!slots.some(Boolean)) {
      onChange("");
      return "";
    }

    setSlots(slotsFromIsoDate(value));
    return null;
  }

  function handleFocus() {
    setFocused(true);
    queueCaret(getDisplayPositionForSlot(getSlotIndexAtOrAfter(inputRef.current?.selectionStart ?? 0)));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const nextFocusedNode = event.relatedTarget;
    if (
      (nextFocusedNode && containerRef.current?.contains(nextFocusedNode))
      || interactingInsideRef.current
    ) {
      onBlur?.(event);
      return;
    }

    commitSlots();
    setFocused(false);
    setCalendarOpen(false);
    onBlur?.(event);
  }

  function handleClick() {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const currentPosition = input.selectionStart ?? 0;
    queueCaret(getDisplayPositionForSlot(getSlotIndexAtOrAfter(currentPosition)));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const rawText = event.clipboardData.getData("text");
    const parsedIsoDate = parseDateInput(rawText);

    if (parsedIsoDate) {
      const nextSlots = slotsFromIsoDate(parsedIsoDate);
      setSlots(nextSlots);
      onChange(parsedIsoDate);
      queueCaret(getDisplayPositionForSlot(SLOT_COUNT - 1, true));
      return;
    }

    replaceSelectionWithDigits(rawText, event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0);
  }

  function handleFallbackChange(nextValue: string) {
    const nextSlots = slotsFromDisplayString(nextValue);
    setSlots(nextSlots);
    syncExternalValue(nextSlots);
  }

  function handleSetToday() {
    const todayIsoDate = formatDateObjectToIso(new Date());
    const nextSlots = slotsFromIsoDate(todayIsoDate);
    setSlots(nextSlots);
    onChange(todayIsoDate);
    setCalendarOpen(false);
    queueCaret(getDisplayPositionForSlot(SLOT_COUNT - 1, true));
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) {
      return;
    }
    const isoDate = formatDateObjectToIso(date);
    const nextSlots = slotsFromIsoDate(isoDate);
    setSlots(nextSlots);
    onChange(isoDate);
    setCalendarMonth(date);
    setCalendarOpen(false);
    inputRef.current?.focus();
    queueCaret(getDisplayPositionForSlot(SLOT_COUNT - 1, true));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const selectionStart = event.currentTarget.selectionStart ?? 0;
    const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      const committed = commitSlots();
      if (committed !== null || !slots.some(Boolean)) {
        if (onEnter) {
          onEnter();
        } else {
          event.currentTarget.form?.requestSubmit();
        }
      }
      return;
    }

    if (event.key === "ArrowDown" && (event.altKey || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setCalendarOpen(true);
      return;
    }

    if (event.key === "Escape" && calendarOpen) {
      event.preventDefault();
      setCalendarOpen(false);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const previousSlotIndex = getSlotIndexBefore(selectionStart);
      if (previousSlotIndex !== null) {
        queueCaret(getDisplayPositionForSlot(previousSlotIndex));
      }
      onKeyDown?.(event);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextSlotIndex = getSlotIndexAtOrAfter(selectionEnd + (selectionStart === selectionEnd ? 1 : 0));
      if (nextSlotIndex !== null) {
        queueCaret(getDisplayPositionForSlot(nextSlotIndex));
      } else {
        queueCaret(MASK_DISPLAY.length);
      }
      onKeyDown?.(event);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      queueCaret(getDisplayPositionForSlot(0));
      onKeyDown?.(event);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      queueCaret(MASK_DISPLAY.length);
      onKeyDown?.(event);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      clearSelectionOrSlot(selectionStart, selectionEnd, event.key === "Backspace" ? "backspace" : "delete");
      onKeyDown?.(event);
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      onKeyDown?.(event);
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      replaceSelectionWithDigits(event.key, selectionStart, selectionEnd);
      onKeyDown?.(event);
      return;
    }

    if (event.key === "." || event.key === "/" || event.key === "-" || event.key === " ") {
      event.preventDefault();
      const nextSlotIndex = getSlotIndexAtOrAfter(selectionEnd + 1);
      if (nextSlotIndex !== null) {
        queueCaret(getDisplayPositionForSlot(nextSlotIndex));
      }
      onKeyDown?.(event);
      return;
    }

    onKeyDown?.(event);
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
          onChange={(event) => handleFallbackChange(event.target.value)}
          onClick={handleClick}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        <button
          aria-expanded={calendarOpen}
          aria-label="Открыть календарь"
          className="date-input__calendar-toggle"
          disabled={props.disabled || props.readOnly}
          onMouseDownCapture={markInteractingInside}
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
            onMouseDownCapture={markInteractingInside}
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

function getDisplayPositionForSlot(slotIndex: number | null, end = false): number {
  if (slotIndex === null) {
    return 0;
  }
  if (end) {
    return MASK_DISPLAY.length;
  }
  return EDITABLE_POSITIONS[Math.max(0, Math.min(slotIndex, SLOT_COUNT - 1))] ?? 0;
}

function getSlotIndexAtOrAfter(position: number): number {
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    if (EDITABLE_POSITIONS[index] >= position) {
      return index;
    }
  }
  return SLOT_COUNT - 1;
}

function getSlotIndexBefore(position: number): number | null {
  for (let index = SLOT_COUNT - 1; index >= 0; index -= 1) {
    if (EDITABLE_POSITIONS[index] < position) {
      return index;
    }
  }
  return null;
}

function getSelectedSlotIndexes(start: number, end: number): number[] {
  if (end <= start) {
    return [];
  }
  return EDITABLE_POSITIONS
    .map((position, index) => ({ position, index }))
    .filter(({ position }) => position >= start && position < end)
    .map(({ index }) => index);
}

function slotsFromIsoDate(value: string | null | undefined): string[] {
  const displayValue = formatIsoDateForDisplay(value);
  return slotsFromDisplayString(displayValue);
}

function slotsFromDisplayString(rawValue: string): string[] {
  const nextSlots = Array.from({ length: SLOT_COUNT }, () => "");
  const digits = rawValue.replace(/\D/g, "").slice(0, SLOT_COUNT);

  for (let index = 0; index < digits.length; index += 1) {
    nextSlots[index] = digits[index] ?? "";
  }

  return nextSlots;
}

function formatSlotsForDisplay(slots: string[]): string {
  return MASK_DISPLAY.split("").map((character, index) => {
    const slotIndex = EDITABLE_POSITIONS.indexOf(index as (typeof EDITABLE_POSITIONS)[number]);
    if (slotIndex === -1) {
      return character;
    }
    return slots[slotIndex] || "_";
  }).join("");
}

function parseSlotsToIso(slots: string[]): string | null {
  if (slots.some((slot) => !slot)) {
    return null;
  }

  const day = `${slots[0]}${slots[1]}`;
  const month = `${slots[2]}${slots[3]}`;
  const year = `${slots[4]}${slots[5]}${slots[6]}${slots[7]}`;
  return buildIsoDate(year, month, day);
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
