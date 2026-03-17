export type AttachmentPreviewKind = "image" | "pdf" | "other";

export function buildPendingFileKey(file: Pick<File, "name" | "size" | "lastModified" | "type">): string {
  return [file.name, file.size, file.lastModified, file.type].join("::");
}

export function appendPendingFiles(current: File[], next: File[] | FileList | null | undefined): File[] {
  const picked = Array.isArray(next) ? next : Array.from(next ?? []);
  if (!picked.length) {
    return current;
  }
  const result = [...current];
  const seen = new Set(current.map((file) => buildPendingFileKey(file)));
  for (const file of picked) {
    const key = buildPendingFileKey(file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(file);
  }
  return result;
}

export function removePendingFile(current: File[], target: File): File[] {
  const targetKey = buildPendingFileKey(target);
  return current.filter((file) => buildPendingFileKey(file) !== targetKey);
}

export function openFilePicker(input: HTMLInputElement | null): void {
  if (!input) {
    return;
  }
  input.value = "";
  input.click();
}

export function getAttachmentPreviewKind(fileName: string, mimeType?: string | null): AttachmentPreviewKind {
  const normalizedMimeType = (mimeType ?? "").toLowerCase();
  if (normalizedMimeType.startsWith("image/")) {
    return "image";
  }
  if (normalizedMimeType === "application/pdf") {
    return "pdf";
  }

  const extension = getFileExtension(fileName);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif"].includes(extension)) {
    return "image";
  }
  if (extension === "pdf") {
    return "pdf";
  }
  return "other";
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts[parts.length - 1]?.toLowerCase() ?? "";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatAttachmentShortMeta(fileSize: number, mimeType?: string | null): string {
  return [formatFileSize(fileSize), mimeType ?? null]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}
