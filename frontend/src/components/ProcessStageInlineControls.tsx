import { DateInput } from "@/components/DateInput";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";

type ProcessStageDateControlProps = {
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
};

export function ProcessStageDateControl({
  disabled = false,
  value,
  onChange,
  onEnter,
}: ProcessStageDateControlProps) {
  return (
    <div className="min-w-0">
      <DateInput
        className="form-input form-input--compact"
        disabled={disabled}
        onChange={onChange}
        onEnter={onEnter}
        value={value}
      />
    </div>
  );
}

type ProcessStageActionsProps = {
  addLabel: string;
  canAdd: boolean;
  canMoveDown?: boolean;
  canMoveUp?: boolean;
  canRemove?: boolean;
  disabled?: boolean;
  moveDownLabel?: string;
  moveUpLabel?: string;
  removeLabel?: string;
  onAdd: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onRemove?: () => void;
};

export function ProcessStageActions({
  addLabel,
  canAdd,
  canMoveDown = false,
  canMoveUp = false,
  canRemove = false,
  disabled = false,
  moveDownLabel,
  moveUpLabel,
  removeLabel,
  onAdd,
  onMoveDown,
  onMoveUp,
  onRemove,
}: ProcessStageActionsProps) {
  return (
    <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
      {canMoveUp && onMoveUp ? (
        <IconActionButton
          disabled={disabled}
          icon={<ArrowIcon direction="up" />}
          label={moveUpLabel ?? "Переместить этап выше"}
          onClick={onMoveUp}
        />
      ) : null}
      {canMoveDown && onMoveDown ? (
        <IconActionButton
          disabled={disabled}
          icon={<ArrowIcon direction="down" />}
          label={moveDownLabel ?? "Переместить этап ниже"}
          onClick={onMoveDown}
        />
      ) : null}
      {canRemove && onRemove ? (
        <IconActionButton
          className="icon-action-button--danger"
          disabled={disabled}
          icon={<Icon className="h-4 w-4" name="delete" />}
          label={removeLabel ?? "Удалить этап"}
          onClick={onRemove}
        />
      ) : null}
      {canAdd ? (
        <IconActionButton
          className="icon-action-button--accent"
          disabled={disabled}
          icon={<Icon className="h-4 w-4" name="plus" />}
          label={addLabel}
          onClick={onAdd}
        />
      ) : null}
    </div>
  );
}

type ProcessStageDraftCardProps = {
  className: string;
  date: string;
  gridClassName: string;
  label: string;
  placeholder: string;
  spacer?: boolean;
  statusLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDateChange: (value: string) => void;
  onLabelChange: (value: string) => void;
};

export function ProcessStageDraftCard({
  className,
  date,
  gridClassName,
  label,
  placeholder,
  spacer = false,
  statusLabel = "Новый пункт",
  onCancel,
  onConfirm,
  onDateChange,
  onLabelChange,
}: ProcessStageDraftCardProps) {
  return (
    <div className={className}>
      <div className={["grid items-start gap-3", gridClassName].join(" ")}>
        <label className="min-w-0 space-y-1">
          <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
            Название этапа
          </span>
          <input
            className="form-input form-input--compact"
            maxLength={120}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={label}
          />
        </label>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дата</p>
          <DateInput
            className="form-input form-input--compact"
            onChange={onDateChange}
            onEnter={onConfirm}
            value={date}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Статус</p>
          <p className="text-sm text-steel">{statusLabel}</p>
        </div>
        {spacer ? <div aria-hidden="true" className="hidden md:block" /> : null}
        <div className="flex items-end justify-end gap-1.5 md:pt-5">
          <IconActionButton
            className="icon-action-button--danger"
            icon={
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6.75 6.75 10.5 10.5m-10.5 0 10.5-10.5"
                />
              </svg>
            }
            label="Отменить добавление этапа"
            onClick={onCancel}
          />
          <IconActionButton
            className="icon-action-button--success"
            icon={<Icon className="h-4 w-4" name="check" />}
            label="Добавить этап"
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      {direction === "up" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 14.25 5.25-5.25 5.25 5.25" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 9.75 5.25 5.25 5.25-5.25" />
      )}
    </svg>
  );
}
