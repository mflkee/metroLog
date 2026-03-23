import { type FormEvent } from "react";

import { Modal } from "@/components/Modal";

type DeleteConfirmModalProps = {
  confirmLabel?: string;
  description?: string;
  errorMessage?: string | null;
  isOpen: boolean;
  isPending?: boolean;
  pendingLabel?: string;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  confirmLabel = "Подтвердить удаление",
  description,
  errorMessage,
  isOpen,
  isPending = false,
  pendingLabel = "Удаляем...",
  title,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    onConfirm();
  }

  return (
    <Modal
      description={description}
      open={isOpen}
      size="sm"
      title={title}
      onClose={onClose}
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-[#b04c43]">{errorMessage}</p> : null}
        <div className="flex justify-end">
          <button
            aria-label={confirmLabel}
            autoFocus
            className="btn-primary disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
