import changelogRaw from "../../../CHANGELOG.md?raw";

import { MarkdownText } from "@/components/MarkdownText";
import { Modal } from "@/components/Modal";

type WhatsNewModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * «Что нового» — это CHANGELOG.md как есть, отрендеренный как Markdown: заголовки версий, списки
 * изменений, выделения. Раньше строки разбирались вручную и `##` попадали в текст.
 */
export function WhatsNewModal({ open, onClose }: WhatsNewModalProps) {
  return (
    <Modal title="Что нового" open={open} onClose={onClose} size="xl">
      <MarkdownText text={changelogRaw} />
    </Modal>
  );
}
