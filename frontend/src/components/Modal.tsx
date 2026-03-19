import { type MouseEvent, type ReactNode, useEffect } from "react";

type ModalProps = {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "sm";
};

export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  footer,
  size = "default",
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,20,27,0.42)] px-4 py-8"
      role="dialog"
      onClick={handleBackdropClick}
    >
      <div
        className={[
          "w-full rounded-[28px] border border-line bg-white shadow-panel",
          size === "sm" ? "max-w-md" : "max-w-2xl",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold text-ink">{title}</h3>
            {description ? <p className="mt-1 text-sm text-steel">{description}</p> : null}
          </div>
          <button
            aria-label="Закрыть"
            className="icon-action-button"
            title="Закрыть"
            type="button"
            onClick={onClose}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
