import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";

export type ProcessBatchItemCandidate = {
  id: number;
  title: string;
  subtitle: string;
  meta?: string | null;
};

type ProcessBatchItemsModalProps = {
  open: boolean;
  title: string;
  description: string;
  searchValue: string;
  searchSuggestions?: string[];
  onSearchChange: (value: string) => void;
  onClose: () => void;
  items: ProcessBatchItemCandidate[];
  onAdd: (equipmentId: number) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  emptyMessage: string;
  pendingEquipmentId?: number | null;
};

export function ProcessBatchItemsModal({
  open,
  title,
  description,
  searchValue,
  searchSuggestions = [],
  onSearchChange,
  onClose,
  items,
  onAdd,
  isLoading = false,
  errorMessage,
  emptyMessage,
  pendingEquipmentId = null,
}: ProcessBatchItemsModalProps) {
  return (
    <Modal
      description={description}
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
    >
      <div className="space-y-4">
        <label className="tone-child flex items-center gap-2 rounded-2xl border border-line px-4 py-3 text-sm text-steel shadow-panel">
          <span className="sr-only">Поиск приборов</span>
          <svg
            className="h-4 w-4 text-steel"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
            />
          </svg>
          <AutocompleteInput
            className="w-full bg-transparent text-ink outline-none placeholder:text-steel"
            placeholder="Поиск по прибору, объекту, серийному номеру"
            suggestions={searchSuggestions}
            value={searchValue}
            onChange={onSearchChange}
          />
        </label>

        {errorMessage ? <p className="text-sm text-[#b04c43]">{errorMessage}</p> : null}
        {isLoading ? <p className="text-sm text-steel">Загружаем список приборов...</p> : null}

        {!isLoading && !items.length ? (
          <div className="tone-child rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-steel">
            {emptyMessage}
          </div>
        ) : null}

        {!isLoading ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                className="tone-child flex items-start justify-between gap-3 rounded-2xl border border-line px-3 py-3 shadow-panel"
                key={item.id}
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  <p className="text-xs text-steel">{item.subtitle}</p>
                  {item.meta ? <p className="text-[11px] text-steel">{item.meta}</p> : null}
                </div>
                <IconActionButton
                  className="mt-0.5 h-9 w-9 shrink-0"
                  disabled={pendingEquipmentId === item.id}
                  icon={
                    pendingEquipmentId === item.id ? (
                      <span className="text-sm leading-none">…</span>
                    ) : (
                      <Icon className="h-4 w-4" name="plus" />
                    )
                  }
                  label={`Добавить прибор «${item.title}» в группу`}
                  onClick={() => onAdd(item.id)}
                  size="tiny"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
