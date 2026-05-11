import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { formatFileSize, getAttachmentPreviewKind, getFileExtension } from "@/lib/attachments";

type PreviewableAttachment = {
  id: number;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
};

type AttachmentPreviewListProps<T extends PreviewableAttachment> = {
  attachments: T[];
  loadPreview: (attachment: T) => Promise<Blob>;
  onDownload: (attachment: T) => void;
  onDelete?: (attachment: T) => void;
  canDelete?: (attachment: T) => boolean;
  downloadingId?: number | null;
  deletingId?: number | null;
  getMeta?: (attachment: T) => string | null;
  columns?: "grid" | "single";
  previewVariant?: "default" | "tall" | "a4" | "compact";
  previewLoadMode?: "auto" | "on-open";
  className?: string;
};

type AttachmentPreviewCardProps<T extends PreviewableAttachment> = {
  attachment: T;
  loadPreview: (attachment: T) => Promise<Blob>;
  onDownload: (attachment: T) => void;
  onDelete?: (attachment: T) => void;
  canDelete?: (attachment: T) => boolean;
  downloadingId?: number | null;
  deletingId?: number | null;
  getMeta?: (attachment: T) => string | null;
  previewVariant: "default" | "tall" | "a4" | "compact";
  previewLoadMode: "auto" | "on-open";
};

const previewBlobCache = new Map<string, Promise<Blob>>();

export function AttachmentPreviewList<T extends PreviewableAttachment>({
  attachments,
  className,
  canDelete,
  columns = "grid",
  deletingId,
  downloadingId,
  getMeta,
  loadPreview,
  onDelete,
  onDownload,
  previewVariant = "default",
  previewLoadMode = "auto",
}: AttachmentPreviewListProps<T>) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div
      className={[
        "grid gap-3",
        previewVariant === "compact"
          ? "gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          : columns === "grid"
            ? "sm:grid-cols-2"
            : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {attachments.map((attachment) => (
        <AttachmentPreviewCard
          attachment={attachment}
          canDelete={canDelete}
          deletingId={deletingId}
          downloadingId={downloadingId}
          getMeta={getMeta}
          key={attachment.id}
          loadPreview={loadPreview}
          onDelete={onDelete}
          onDownload={onDownload}
          previewLoadMode={previewLoadMode}
          previewVariant={previewVariant}
        />
      ))}
    </div>
  );
}

function AttachmentPreviewCard<T extends PreviewableAttachment>({
  attachment,
  canDelete,
  deletingId,
  downloadingId,
  getMeta,
  loadPreview,
  onDelete,
  onDownload,
  previewLoadMode,
  previewVariant,
}: AttachmentPreviewCardProps<T>) {
  const previewKind = useMemo(
    () => getAttachmentPreviewKind(attachment.fileName, attachment.fileMimeType),
    [attachment.fileMimeType, attachment.fileName],
  );
  const extension = (getFileExtension(attachment.fileName) || "file").toUpperCase();
  const meta = getMeta?.(attachment) ?? formatFileSize(attachment.fileSize);
  const cacheKey = `${attachment.id}:${attachment.fileSize}:${attachment.fileName}:${attachment.fileMimeType ?? ""}`;
  const cardRef = useRef<HTMLElement | null>(null);
  const loadPreviewRef = useRef(loadPreview);
  const attachmentRef = useRef(attachment);
  const viewerHistoryPushedRef = useRef(false);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(
    previewKind === "other" ? true : previewLoadMode === "auto",
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerOwnsUrl, setViewerOwnsUrl] = useState(false);

  useEffect(() => {
    loadPreviewRef.current = loadPreview;
  }, [loadPreview]);

  useEffect(() => {
    attachmentRef.current = attachment;
  }, [attachment]);

  useEffect(() => {
    if (previewKind === "other") {
      setShouldLoadPreview(true);
      return undefined;
    }

    if (previewLoadMode === "on-open") {
      setShouldLoadPreview(false);
      return undefined;
    }

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoadPreview(true);
      return undefined;
    }

    const node = cardRef.current;
    if (!node) {
      setShouldLoadPreview(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }
        setShouldLoadPreview(true);
        observer.disconnect();
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [attachment.id, previewKind, previewLoadMode]);

  useEffect(() => {
    if (!shouldLoadPreview || previewKind === "other") {
      return undefined;
    }

    let active = true;
    let objectUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewFailed(false);

    void getCachedPreviewBlob(cacheKey, () => loadPreviewRef.current(attachmentRef.current))
      .then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        previewBlobCache.delete(cacheKey);
        setPreviewFailed(true);
        setPreviewUrl(null);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setPreviewLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cacheKey, previewKind, shouldLoadPreview]);

  useEffect(() => {
    if (!viewerOpen) {
      return undefined;
    }

    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        metro_log_attachment_viewer: cacheKey,
      },
      "",
    );
    viewerHistoryPushedRef.current = true;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestCloseViewer();
      }
    }

    function handlePopState() {
      viewerHistoryPushedRef.current = false;
      setViewerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [cacheKey, viewerOpen]);

  useEffect(() => {
    if (viewerOpen || !viewerOwnsUrl || !viewerUrl) {
      return undefined;
    }
    URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerOwnsUrl(false);
    return undefined;
  }, [viewerOpen, viewerOwnsUrl, viewerUrl]);

  useEffect(() => {
    return () => {
      if (viewerOwnsUrl && viewerUrl) {
        URL.revokeObjectURL(viewerUrl);
      }
    };
  }, [viewerOwnsUrl, viewerUrl]);

  async function handleOpenViewer() {
    if (previewKind === "other") {
      return;
    }

    if (previewUrl) {
      setViewerUrl(previewUrl);
      setViewerOwnsUrl(false);
      setViewerOpen(true);
      return;
    }

    setViewerLoading(true);
    try {
      if (previewLoadMode === "on-open") {
        setShouldLoadPreview(true);
      }
      const blob = await getCachedPreviewBlob(cacheKey, () =>
        loadPreviewRef.current(attachmentRef.current),
      );
      const objectUrl = URL.createObjectURL(blob);
      setViewerUrl(objectUrl);
      setViewerOwnsUrl(true);
      setViewerOpen(true);
    } catch {
      previewBlobCache.delete(cacheKey);
      setPreviewFailed(true);
    } finally {
      setViewerLoading(false);
    }
  }

  function requestCloseViewer() {
    if (viewerHistoryPushedRef.current) {
      window.history.back();
      return;
    }
    setViewerOpen(false);
  }

  const viewerPortal =
    viewerOpen && viewerUrl && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-modal="true"
            className="fixed inset-0 z-[280] flex items-center justify-center bg-[rgba(11,20,27,0.82)] px-3 py-3 sm:px-6 sm:py-6"
            role="dialog"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                requestCloseViewer();
              }
            }}
          >
            <div className="flex h-full w-full max-w-[min(96vw,96rem)] flex-col overflow-hidden rounded-[24px] border border-line bg-[var(--panel-bg)] shadow-panel">
              <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-6">
                <div className="min-w-0">
                  <div className="break-words text-base font-semibold text-ink">
                    {attachment.fileName}
                  </div>
                  {meta ? <div className="mt-1 text-sm text-steel">{meta}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IconActionButton
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                      </svg>
                    }
                    label={`Скачать ${attachment.fileName}`}
                    onClick={() => onDownload(attachment)}
                  />
                  <IconActionButton
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    }
                    label="Закрыть просмотр"
                    onClick={requestCloseViewer}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
                {previewKind === "pdf" ? (
                  <iframe
                    className="h-full min-h-[70dvh] w-full rounded-2xl border border-line bg-white"
                    src={`${viewerUrl}#toolbar=1&navpanes=0&view=FitH`}
                    title={attachment.fileName}
                  />
                ) : (
                  <img
                    alt={attachment.fileName}
                    className="mx-auto block max-h-[78dvh] max-w-full rounded-2xl object-contain"
                    src={viewerUrl}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (previewVariant === "compact") {
    if (previewKind === "other") {
      return (
        <article className="tone-child relative aspect-square overflow-hidden rounded-2xl border border-line">
          <button
            aria-label={`Скачать ${attachment.fileName}`}
            className="absolute inset-0 z-10 bg-transparent"
            type="button"
            onClick={() => onDownload(attachment)}
          />
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
            <IconActionButton
              icon={
                downloadingId === attachment.id ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <Icon className="h-4 w-4" name="download" />
                )
              }
              label={`Скачать ${attachment.fileName}`}
              onClick={() => onDownload(attachment)}
              size="tiny"
            />
            {onDelete && (canDelete?.(attachment) ?? true) ? (
              <IconActionButton
                className="icon-action-button--danger"
                disabled={deletingId === attachment.id}
                icon={
                  deletingId === attachment.id ? (
                    <span className="text-sm leading-none">…</span>
                  ) : (
                    <Icon className="h-4 w-4" name="delete" />
                  )
                }
                label={`Удалить ${attachment.fileName}`}
                onClick={() => onDelete(attachment)}
                size="tiny"
              />
            ) : null}
          </div>
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 pb-14 pt-4 text-center">
            <div className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
              {extension}
            </div>
            {attachment.fileMimeType ? (
              <div className="break-all text-[11px] leading-4 text-steel">
                {attachment.fileMimeType}
              </div>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[rgba(11,20,27,0.92)] via-[rgba(11,20,27,0.76)] to-transparent px-3 pb-3 pt-10 text-white">
            <div className="truncate text-xs font-semibold">{attachment.fileName}</div>
            {meta ? <div className="truncate text-[11px] text-white/78">{meta}</div> : null}
          </div>
        </article>
      );
    }

    return (
      <>
        <article
          className="tone-child relative aspect-square overflow-hidden rounded-2xl border border-line"
          ref={cardRef}
        >
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
            <IconActionButton
              disabled={viewerLoading}
              icon={
                viewerLoading ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <Icon className="h-4 w-4" name="details" />
                )
              }
              label={`Открыть ${attachment.fileName}`}
              onClick={() => void handleOpenViewer()}
              size="tiny"
            />
            <IconActionButton
              icon={
                downloadingId === attachment.id ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                  </svg>
                )
              }
              label={`Скачать ${attachment.fileName}`}
              onClick={() => onDownload(attachment)}
              size="tiny"
            />
            {onDelete && (canDelete?.(attachment) ?? true) ? (
              <IconActionButton
                className="icon-action-button--danger"
                disabled={deletingId === attachment.id}
                icon={
                  deletingId === attachment.id ? (
                    <span className="text-sm leading-none">…</span>
                  ) : (
                    <Icon className="h-4 w-4" name="delete" />
                  )
                }
                label={`Удалить ${attachment.fileName}`}
                onClick={() => onDelete(attachment)}
                size="tiny"
              />
            ) : null}
          </div>

          <div className="tone-grandchild h-full w-full">
            {previewKind === "image" && previewUrl ? (
              <img
                alt={attachment.fileName}
                className="h-full w-full object-cover"
                loading="lazy"
                src={previewUrl}
              />
            ) : null}
            {previewKind === "pdf" && previewUrl ? (
              <iframe
                className="h-full w-full border-0"
                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                title={attachment.fileName}
              />
            ) : null}
          {!shouldLoadPreview ? (
            <AttachmentPreviewFallback
              extension={extension}
              message={
                previewLoadMode === "on-open"
                  ? "Открой, чтобы загрузить."
                  : "Превью загрузится при прокрутке."
              }
            />
          ) : null}
            {previewLoading ? (
              <AttachmentPreviewFallback extension={extension} message="Загружаем превью..." />
            ) : null}
            {!previewLoading && previewFailed ? (
              <AttachmentPreviewFallback
                extension={extension}
                message="Не удалось загрузить превью."
              />
            ) : null}
          </div>

          <button
            aria-label={`Открыть ${attachment.fileName}`}
            className="absolute inset-0 z-10 cursor-zoom-in bg-transparent"
            disabled={viewerLoading}
            type="button"
            onClick={() => void handleOpenViewer()}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[rgba(11,20,27,0.92)] via-[rgba(11,20,27,0.76)] to-transparent px-3 pb-3 pt-10 text-white">
            <div className="truncate text-xs font-semibold">{attachment.fileName}</div>
            {meta ? <div className="truncate text-[11px] text-white/78">{meta}</div> : null}
          </div>
        </article>
        {viewerPortal}
      </>
    );
  }

  if (previewKind === "other") {
    return (
      <article
        className={[
          "tone-child rounded-2xl border border-line p-3",
          previewVariant === "a4" ? "mx-auto w-full max-w-[22rem]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold leading-5 text-ink">
              {attachment.fileName}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
                {extension}
              </div>
              {meta ? <div className="text-xs text-steel">{meta}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconActionButton
              icon={
                downloadingId === attachment.id ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <Icon className="h-4 w-4" name="download" />
                )
              }
              label={`Скачать ${attachment.fileName}`}
              onClick={() => onDownload(attachment)}
              size="tiny"
            />
            {onDelete && (canDelete?.(attachment) ?? true) ? (
              <IconActionButton
                className="icon-action-button--danger"
                disabled={deletingId === attachment.id}
                icon={
                  deletingId === attachment.id ? (
                    <span className="text-sm leading-none">…</span>
                  ) : (
                    <Icon className="h-4 w-4" name="delete" />
                  )
                }
                label={`Удалить ${attachment.fileName}`}
                onClick={() => onDelete(attachment)}
                size="tiny"
              />
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <>
      <article
        className={[
          "tone-child rounded-2xl border border-line p-3",
          previewVariant === "a4" ? "mx-auto w-full max-w-[22rem]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={cardRef}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold leading-5 text-ink">
              {attachment.fileName}
            </div>
            {meta ? <div className="mt-1 text-xs text-steel">{meta}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconActionButton
              disabled={viewerLoading}
              icon={
                viewerLoading ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <Icon className="h-4 w-4" name="details" />
                )
              }
              label={`Открыть ${attachment.fileName}`}
              onClick={() => void handleOpenViewer()}
              size="tiny"
            />
            <IconActionButton
              icon={
                downloadingId === attachment.id ? (
                  <span className="text-sm leading-none">…</span>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                  </svg>
                )
              }
              label={`Скачать ${attachment.fileName}`}
              onClick={() => onDownload(attachment)}
              size="tiny"
            />
            {onDelete && (canDelete?.(attachment) ?? true) ? (
              <IconActionButton
                className="icon-action-button--danger"
                disabled={deletingId === attachment.id}
                icon={
                  deletingId === attachment.id ? (
                    <span className="text-sm leading-none">…</span>
                  ) : (
                    <Icon className="h-4 w-4" name="delete" />
                  )
                }
                label={`Удалить ${attachment.fileName}`}
                onClick={() => onDelete(attachment)}
                size="tiny"
              />
            ) : null}
          </div>
        </div>

        <div
          className={[
            "tone-grandchild relative mt-3 flex w-full items-center justify-center overflow-hidden rounded-2xl border border-line text-left",
            "transition hover:border-signal-info",
            getPreviewFrameClassName(previewVariant),
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {previewKind === "image" && previewUrl ? (
            <img
              alt={attachment.fileName}
              className="h-full w-full object-cover"
              loading="lazy"
              src={previewUrl}
            />
          ) : null}
          {previewKind === "pdf" && previewUrl ? (
            <iframe
              className="h-full w-full border-0"
              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={attachment.fileName}
            />
          ) : null}
          {!shouldLoadPreview ? (
            <AttachmentPreviewFallback
              extension={extension}
              message={
                previewLoadMode === "on-open"
                  ? "Открой, чтобы загрузить."
                  : "Превью загрузится при прокрутке."
              }
            />
          ) : null}
          {previewLoading ? (
            <AttachmentPreviewFallback extension={extension} message="Загружаем превью..." />
          ) : null}
          {!previewLoading && previewFailed ? (
            <AttachmentPreviewFallback
              extension={extension}
              message="Не удалось загрузить превью. Открой файл целиком."
            />
          ) : null}
          <button
            aria-label={`Открыть ${attachment.fileName}`}
            className="absolute inset-0 z-10 cursor-zoom-in bg-transparent"
            disabled={viewerLoading}
            type="button"
            onClick={() => void handleOpenViewer()}
          />
        </div>
      </article>

      {viewerPortal}
    </>
  );
}

function AttachmentPreviewFallback({
  extension,
  message,
}: {
  extension: string;
  message: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
      <div className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
        {extension}
      </div>
      <p className="text-xs text-steel">{message}</p>
    </div>
  );
}

function getPreviewFrameClassName(variant: "default" | "tall" | "a4" | "compact"): string {
  if (variant === "compact") {
    return "aspect-square";
  }
  if (variant === "a4") {
    return "aspect-[210/297]";
  }
  if (variant === "tall") {
    return "h-48 sm:h-56";
  }
  return "h-36 sm:h-40";
}

function getCachedPreviewBlob(cacheKey: string, loader: () => Promise<Blob>): Promise<Blob> {
  const existing = previewBlobCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = loader().catch((error) => {
    previewBlobCache.delete(cacheKey);
    throw error;
  });
  previewBlobCache.set(cacheKey, pending);
  return pending;
}
