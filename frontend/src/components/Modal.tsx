import { type MouseEvent, type ReactNode, useEffect } from "react";

import { IconActionButton } from "@/components/IconActionButton";

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

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(11,20,27,0.42)] px-4 py-8"
      role="dialog"
      onClick={handleBackdropClick}
    >
      <div
        className={[
          "tone-parent my-auto w-full max-h-[calc(100vh-4rem)] overflow-hidden rounded-[28px] border border-line shadow-panel",
          size === "sm" ? "max-w-md" : "max-w-2xl",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold text-ink">{title}</h3>
            {description ? <p className="mt-1 text-sm text-steel">{description}</p> : null}
          </div>
          <IconActionButton
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            }
            label="Закрыть"
            onClick={onClose}
          />
        </div>
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-line px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
