import { IconActionButton } from "@/components/IconActionButton";

type PrivateNoteToggleButtonProps = {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type PrivateNoteBadgeProps = {
  className?: string;
};

function PrivateEyeIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.58 10.58a2 2 0 0 0 2.84 2.84"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.88 5.09A10.94 10.94 0 0 1 12 4.88c5.4 0 9.27 4.11 10.5 7.12a14.73 14.73 0 0 1-3.02 4.34"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.61 6.61C4.87 7.82 3.66 9.52 3 12c1.23 3.01 5.1 7.12 10.5 7.12 1.62 0 3.12-.31 4.46-.86"
        />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.46 12C3.73 8.94 7.5 4.88 12 4.88c4.5 0 8.27 4.06 9.54 7.12-1.27 3.06-5.04 7.12-9.54 7.12-4.5 0-8.27-4.06-9.54-7.12Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.12a3.12 3.12 0 1 0 0-6.24 3.12 3.12 0 0 0 0 6.24Z" />
    </svg>
  );
}

export function PrivateNoteToggleButton({
  active,
  disabled,
  onClick,
}: PrivateNoteToggleButtonProps) {
  return (
    <IconActionButton
      aria-pressed={active}
      className={[
        "h-10 w-10",
        active ? "border-signal-info bg-[var(--accent-soft)] text-ink" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      icon={<PrivateEyeIcon active={active} />}
      label={active ? "Приватный комментарий включён" : "Сделать комментарий приватным"}
      onClick={onClick}
      title={active ? "Приватный комментарий" : "Обычный комментарий"}
      type="button"
    />
  );
}

export function PrivateNoteBadge({ className }: PrivateNoteBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PrivateEyeIcon active />
      Приватно
    </span>
  );
}
