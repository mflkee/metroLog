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
  return (
    <Modal
      description={description}
      open={isOpen}
      size="sm"
      title={title}
      onClose={onClose}
    >
      <div className="space-y-3">
        {errorMessage ? <p className="text-sm text-[#b04c43]">{errorMessage}</p> : null}
        <div className="flex justify-end">
          <button
            aria-label={confirmLabel}
            className="btn-primary disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
