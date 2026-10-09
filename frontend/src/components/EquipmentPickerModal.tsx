import { Modal } from "@/components/Modal";
import { EquipmentPicker, type PickedEquipment } from "@/components/EquipmentPicker";

type EquipmentPickerModalProps = {
  open: boolean;
  token: string;
  initialSelection: PickedEquipment[];
  defaultFolderId?: number | null;
  onClose: () => void;
  onConfirm: (picked: PickedEquipment[]) => void;
};

/** The picker in a dialog of its own, for screens that are not already inside one. */
export function EquipmentPickerModal({
  open,
  token,
  initialSelection,
  defaultFolderId = null,
  onClose,
  onConfirm,
}: EquipmentPickerModalProps) {
  if (!open) {
    return null;
  }

  return (
    <Modal
      description="Выбери папку, найди приборы и отметь нужные галочками."
      open={open}
      size="xl"
      title="Выбор приборов"
      onClose={onClose}
    >
      <EquipmentPicker
        defaultFolderId={defaultFolderId}
        initialSelection={initialSelection}
        token={token}
        onCancel={onClose}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}
