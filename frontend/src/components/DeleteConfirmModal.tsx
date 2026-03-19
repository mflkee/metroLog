import { Modal } from "@/components/Modal";

type DeleteConfirmModalProps = {
  description?: string;
  errorMessage?: string | null;
  isOpen: boolean;
  isPending?: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({
  description,
  errorMessage,
  isOpen,
  isPending = false,
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
            aria-label="Подтвердить удаление"
            className="btn-primary disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onConfirm}
          >
            {isPending ? "Удаляем..." : "Подтвердить удаление"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
