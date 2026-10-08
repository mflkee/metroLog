import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import {
  buildPendingFileKey,
  formatFileSize,
  getAttachmentPreviewKind,
  getFileExtension,
} from "@/lib/attachments";

type PendingAttachmentListProps = {
  files: File[];
  onRemove: (file: File) => void;
  className?: string;
  disableRemove?: boolean;
  showRemove?: boolean;
  busyFileKeys?: string[];
  getStatusLabel?: (file: File) => string | null;
};

type PendingAttachmentCardProps = {
  file: File;
  onRemove: (file: File) => void;
  disableRemove: boolean;
  showRemove: boolean;
  isBusy: boolean;
  statusLabel: string | null;
};

export function PendingAttachmentList({
  files,
  onRemove,
  className,
  disableRemove = false,
  showRemove = true,
  busyFileKeys,
  getStatusLabel,
}: PendingAttachmentListProps) {
  if (!files.length) {
    return null;
  }

  const busyKeys = new Set(busyFileKeys ?? []);

  return (
    <div
      className={[
        "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {files.map((file) => {
        const fileKey = buildPendingFileKey(file);
        return (
          <PendingAttachmentCard
            disableRemove={disableRemove}
            file={file}
            isBusy={busyKeys.has(fileKey)}
            key={fileKey}
            onRemove={onRemove}
            showRemove={showRemove}
            statusLabel={getStatusLabel?.(file) ?? null}
          />
        );
      })}
    </div>
  );
}

function PendingAttachmentCard({
  file,
  onRemove,
  disableRemove,
  showRemove,
  isBusy,
  statusLabel,
}: PendingAttachmentCardProps) {
  const previewKind = useMemo(
    () => getAttachmentPreviewKind(file.name, file.type),
    [file.name, file.type],
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const extension = (getFileExtension(file.name) || "file").toUpperCase();

  useEffect(() => {
    if (previewKind === "other") {
      setPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, previewKind]);

  return (
    <article className="tone-child relative aspect-square overflow-hidden rounded-2xl border border-line">
      {statusLabel && !isBusy ? (
        <div className="absolute left-2 top-2 z-20 rounded-full bg-[rgba(11,20,27,0.74)] px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
          {statusLabel}
        </div>
      ) : null}
      {showRemove ? (
        <div className="absolute right-2 top-2 z-20">
          <IconActionButton
            className="icon-action-button--danger"
            disabled={disableRemove}
            icon={<Icon className="h-4 w-4" name="delete" />}
            label={`Убрать ${file.name}`}
            onClick={() => onRemove(file)}
            size="tiny"
          />
        </div>
      ) : null}

      {previewKind === "other" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 pb-14 pt-4 text-center">
          <div className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
            {extension}
          </div>
          {file.type ? (
            <div className="break-all text-[11px] leading-4 text-steel">{file.type}</div>
          ) : null}
        </div>
      ) : (
        <div className="tone-grandchild h-full w-full">
          {previewKind === "image" && previewUrl ? (
            <img
              alt={file.name}
              className="h-full w-full object-cover"
              loading="lazy"
              src={previewUrl}
            />
          ) : null}
          {previewKind === "pdf" && previewUrl ? (
            <iframe
              className="h-full w-full border-0"
              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={file.name}
            />
          ) : null}
        </div>
      )}

      {isBusy ? (
        <div className="absolute inset-0 z-[15] flex items-center justify-center bg-[rgba(11,20,27,0.22)] backdrop-blur-[1px]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(11,20,27,0.72)] text-white shadow-lg">
            <svg
              aria-hidden="true"
              className="h-5 w-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path
                className="opacity-90"
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.5"
              />
            </svg>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-[rgba(11,20,27,0.92)] via-[rgba(11,20,27,0.76)] to-transparent px-3 pb-3 pt-10 text-white">
        <div className="truncate text-xs font-semibold">{file.name}</div>
        <div className="truncate text-[11px] text-white/78">{formatFileSize(file.size)}</div>
      </div>
    </article>
  );
}
