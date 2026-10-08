import changelogRaw from "../../../CHANGELOG.md?raw";

import { Modal } from "@/components/Modal";

function renderChangelog(source: string) {
  return source.split("\n").map((line, index) => {
    const key = `${index}-${line.slice(0, 16)}`;
    if (line.startsWith("## ")) {
      return (
        <h3 key={key} className="mt-4 text-base font-semibold text-ink">
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <h4 key={key} className="mt-3 text-sm font-semibold text-ink">
          {line.slice(4)}
        </h4>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h2 key={key} className="text-lg font-semibold text-ink">
          {line.slice(2)}
        </h2>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={key} className="ml-5 list-disc text-sm text-steel">
          {line.slice(2)}
        </li>
      );
    }
    if (!line.trim()) {
      return <div key={key} className="h-1" />;
    }
    return (
      <p key={key} className="text-sm text-steel">
        {line}
      </p>
    );
  });
}

type WhatsNewModalProps = {
  open: boolean;
  onClose: () => void;
};

export function WhatsNewModal({ open, onClose }: WhatsNewModalProps) {
  return (
    <Modal title="Что нового" open={open} onClose={onClose} size="xl">
      <div className="space-y-1">{renderChangelog(changelogRaw)}</div>
    </Modal>
  );
}
