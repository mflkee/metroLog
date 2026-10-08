"""Equipment-comments mixin for the equipment service."""

from __future__ import annotations

import json
import re
import shutil
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.models.equipment import (
    Equipment,
    EquipmentAttachment,
    EquipmentComment,
    EquipmentCommentAttachment,
)
from app.models.user import User
from app.schemas.equipment import EquipmentCommentCreateRequest, EquipmentCommentUpdateRequest
from app.services.equipment_folders import _format_user_display_name
from app.services.equipment_text import _normalize_optional_text
from app.services.user_service import has_admin_access

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.repositories.equipment_repository import (
        EquipmentAttachmentRepository,
        EquipmentCommentAttachmentRepository,
        EquipmentCommentRepository,
    )

COMMENT_ATTACHMENT_UPLOAD_STAGING_TTL = timedelta(hours=24)
COMMENT_ATTACHMENT_UPLOAD_TOKEN_PATTERN = re.compile(r"^[a-f0-9]{32}$")


def _normalize_attachment_file_name(value: str | None) -> str:
    candidate = Path(value or "").name.strip()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file name must not be empty.",
        )
    if len(candidate) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file name is too long. Maximum length is 255 characters.",
        )
    return candidate


def _normalize_comment_text(value: str | None, *, allow_empty: bool = False) -> str:
    if value is None:
        if allow_empty:
            return ""
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text must not be empty.",
        )
    normalized = value.strip()
    if not normalized:
        if allow_empty:
            return ""
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text must not be empty.",
        )
    if len(normalized) > 4000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text is too long. Maximum length is 4000 characters.",
        )
    return normalized


def _normalize_message_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 4000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message text is too long. Maximum length is 4000 characters.",
        )
    return normalized


def _copy_file_chunked(source_path: Path, destination_path: Path) -> None:
    with source_path.open("rb") as source_file, destination_path.open("wb") as destination_file:
        shutil.copyfileobj(source_file, destination_file, length=1024 * 1024)


def _get_comment_attachment_upload_staging_dir(*, equipment_id: int, user_id: int) -> Path:
    return settings.attachment_storage_path / "_comment-uploads" / str(equipment_id) / str(user_id)


def _get_comment_attachment_upload_manifest_path(
    *,
    staging_dir: Path,
    upload_token: str,
) -> Path:
    return staging_dir / f"{upload_token}.json"


def _cleanup_stale_comment_attachment_uploads(staging_dir: Path) -> None:
    if not staging_dir.exists():
        return

    stale_before = datetime.now(tz=UTC) - COMMENT_ATTACHMENT_UPLOAD_STAGING_TTL
    for path in staging_dir.iterdir():
        try:
            modified_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
        except OSError:
            continue
        if modified_at >= stale_before:
            continue
        if path.is_file():
            path.unlink(missing_ok=True)


def _load_comment_attachment_upload(
    *,
    equipment_id: int,
    user_id: int,
    upload_token: str,
) -> StagedCommentAttachment:
    normalized_upload_token = _normalize_comment_attachment_upload_token(upload_token)
    staging_dir = _get_comment_attachment_upload_staging_dir(
        equipment_id=equipment_id,
        user_id=user_id,
    )
    _cleanup_stale_comment_attachment_uploads(staging_dir)
    manifest_path = _get_comment_attachment_upload_manifest_path(
        staging_dir=staging_dir,
        upload_token=normalized_upload_token,
    )
    if not manifest_path.exists() or not manifest_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария не найдено.",
        )

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        )

    file_name = _normalize_attachment_file_name(payload.get("file_name"))
    file_mime_type = _normalize_optional_text(payload.get("file_mime_type"))
    file_size = payload.get("file_size")
    storage_name = payload.get("storage_name")
    if not isinstance(file_size, int) or file_size <= 0 or not isinstance(storage_name, str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        )

    file_path = staging_dir / storage_name
    if not file_path.exists() or not file_path.is_file():
        manifest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл временного вложения комментария не найден.",
        )

    return StagedCommentAttachment(
        upload_token=normalized_upload_token,
        file_name=file_name,
        file_mime_type=file_mime_type,
        file_size=file_size,
        file_path=file_path,
        manifest_path=manifest_path,
    )


def _delete_comment_attachment_upload_files(staged_attachment: StagedCommentAttachment) -> None:
    staged_attachment.file_path.unlink(missing_ok=True)
    staged_attachment.manifest_path.unlink(missing_ok=True)


def _normalize_comment_attachment_upload_token(value: str) -> str:
    candidate = value.strip().lower()
    if COMMENT_ATTACHMENT_UPLOAD_TOKEN_PATTERN.fullmatch(candidate):
        return candidate
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Некорректный токен временного вложения комментария.",
    )


_ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX: dict[str, str] = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}
_ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
_ATTACHMENT_IMAGE_QUALITY_STEPS: dict[str, tuple[int, ...]] = {
    "JPEG": (82, 76, 70, 64, 58),
    "WEBP": (80, 74, 68, 62, 56),
}
_ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS = 640


def _store_attachment_file(
    *,
    source_path: Path,
    destination_path: Path,
    file_name: str,
    content_type: str | None,
    file_size: int,
) -> StoredAttachmentFile:
    optimized_image = _optimize_attachment_image(
        source_path=source_path,
        file_name=file_name,
        content_type=content_type,
        original_file_size=file_size,
    )
    if optimized_image is None:
        _copy_file_chunked(source_path, destination_path)
        return StoredAttachmentFile(
            file_size=file_size,
            content_type=_normalize_optional_text(content_type),
        )

    destination_path.write_bytes(optimized_image.content)
    return StoredAttachmentFile(
        file_size=len(optimized_image.content),
        content_type=optimized_image.content_type,
    )


def _optimize_attachment_image(
    *,
    source_path: Path,
    file_name: str,
    content_type: str | None,
    original_file_size: int,
) -> OptimizedAttachmentImage | None:
    suffix = Path(file_name).suffix.lower()
    normalized_content_type = _normalize_optional_text(content_type)
    if (
        suffix not in _ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX
        and normalized_content_type not in _ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT.values()
    ):
        return None

    try:
        with Image.open(source_path) as source_image:
            source_image.load()
            source_format = (
                source_image.format or _ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX.get(suffix, "")
            ).upper()
            if source_format not in _ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT:
                return None

            icc_profile = source_image.info.get("icc_profile")
            image = ImageOps.exif_transpose(source_image)
            candidate_dimensions = _build_attachment_image_candidate_dimensions(image.size)

            best_candidate: bytes | None = None
            best_size = original_file_size

            for max_dimension in candidate_dimensions:
                resized_image = _resize_image_to_max_dimension(
                    image=image,
                    max_dimension=max_dimension,
                )
                encoded_candidates = _encode_attachment_image_candidates(
                    image=resized_image,
                    image_format=source_format,
                    icc_profile=icc_profile,
                )
                for encoded_candidate in encoded_candidates:
                    candidate_size = len(encoded_candidate)
                    if candidate_size < best_size:
                        best_candidate = encoded_candidate
                        best_size = candidate_size
                    if candidate_size <= settings.attachment_image_target_size_bytes:
                        break
                if (
                    best_candidate is not None
                    and best_size <= settings.attachment_image_target_size_bytes
                ):
                    break

            if best_candidate is None:
                return None

            return OptimizedAttachmentImage(
                content=best_candidate,
                content_type=_ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT[source_format],
            )
    except (OSError, UnidentifiedImageError, ValueError):
        return None


def _build_attachment_image_candidate_dimensions(size: tuple[int, int]) -> list[int]:
    original_max_dimension = max(size)
    current_dimension = min(
        original_max_dimension,
        settings.attachment_image_max_dimension_pixels,
    )
    dimensions: list[int] = []

    while True:
        if current_dimension not in dimensions:
            dimensions.append(current_dimension)
        if current_dimension <= _ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS:
            break
        next_dimension = max(
            _ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS,
            int(current_dimension * 0.82),
        )
        if next_dimension >= current_dimension:
            break
        current_dimension = next_dimension

    return dimensions


def _resize_image_to_max_dimension(*, image: Image.Image, max_dimension: int) -> Image.Image:
    if max(image.size) <= max_dimension:
        return image.copy()
    resized = image.copy()
    resized.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    return resized


def _encode_attachment_image_candidates(
    *,
    image: Image.Image,
    image_format: str,
    icc_profile: bytes | None,
) -> Iterator[bytes]:
    if image_format == "JPEG":
        for quality in _ATTACHMENT_IMAGE_QUALITY_STEPS["JPEG"]:
            yield _encode_jpeg_attachment_image(
                image=image,
                quality=quality,
                icc_profile=icc_profile,
            )
        return
    if image_format == "WEBP":
        for quality in _ATTACHMENT_IMAGE_QUALITY_STEPS["WEBP"]:
            yield _encode_webp_attachment_image(
                image=image,
                quality=quality,
                icc_profile=icc_profile,
            )
        return
    yield _encode_png_attachment_image(image=image, icc_profile=icc_profile)


def _encode_jpeg_attachment_image(
    *,
    image: Image.Image,
    quality: int,
    icc_profile: bytes | None,
) -> bytes:
    prepared = _prepare_image_for_jpeg(image)
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "JPEG",
        "quality": quality,
        "optimize": True,
        "progressive": True,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _encode_webp_attachment_image(
    *,
    image: Image.Image,
    quality: int,
    icc_profile: bytes | None,
) -> bytes:
    prepared = image.copy()
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "WEBP",
        "quality": quality,
        "method": 6,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _encode_png_attachment_image(
    *,
    image: Image.Image,
    icc_profile: bytes | None,
) -> bytes:
    prepared = image.copy()
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "PNG",
        "optimize": True,
        "compress_level": 9,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _prepare_image_for_jpeg(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "L"}:
        return image.copy()
    if "A" in image.getbands():
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        return background
    return image.convert("RGB")


@dataclass(slots=True)
class UploadedFilePayload:
    file_name: str | None
    content_type: str | None
    temp_path: Path
    file_size: int


@dataclass(slots=True)
class StoredAttachmentFile:
    file_size: int
    content_type: str | None


@dataclass(slots=True)
class CommentAttachmentUpload:
    upload_token: str
    file_name: str
    file_mime_type: str | None
    file_size: int


@dataclass(slots=True)
class StagedCommentAttachment:
    upload_token: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    file_path: Path
    manifest_path: Path


@dataclass(slots=True)
class OptimizedAttachmentImage:
    content: bytes
    content_type: str


def _build_preview_description(text: str | None) -> str | None:
    normalized = _normalize_message_text(text)
    if normalized is None:
        return None
    if len(normalized) <= 160:
        return normalized
    return normalized[:157].rstrip() + "..."


def _build_message_event_description(
    *,
    text: str | None,
    attachment_count: int,
) -> str | None:
    parts: list[str] = []
    preview = _build_preview_description(text)
    if preview:
        parts.append(preview)
    if attachment_count > 0:
        parts.append(f"Вложений: {attachment_count}.")
    return " ".join(parts) if parts else None


class EquipmentCommentsMixin:
    """Mixed into ``EquipmentService``."""

    if TYPE_CHECKING:
        # Provided by EquipmentService through the MRO.
        session: Session
        comments: EquipmentCommentRepository
        attachments: EquipmentAttachmentRepository
        comment_attachments: EquipmentCommentAttachmentRepository

        def _assert_private_note_creation_allowed(
            self, *, is_private: bool, current_user: User
        ) -> None: ...

        def _assert_private_note_visible(self, *, is_private: bool, detail: str) -> None: ...

        def _can_view_private_notes(self) -> bool: ...

        def _commit_and_flush_process_notifications(self) -> None: ...

        def _filter_private_mention_recipients(self, users: list[User]) -> list[User]: ...

        def _record_equipment_event(
            self,
            *,
            action: str,
            user: User,
            equipment: Equipment,
            title: str,
            description: str | None = None,
            batch_key: str | None = None,
        ) -> None: ...

        def _resolve_mentioned_users(
            self,
            *,
            text: str | None,
            exclude_user_id: int | None = None,
            previous_text: str | None = None,
        ) -> list[User]: ...

        def _send_mention_emails(
            self,
            *,
            users: list[User],
            actor: User,
            context_title: str,
            message_preview: str | None,
            target_url: str,
        ) -> None: ...

        def get_equipment(self, *, equipment_id: int) -> Equipment: ...

    def _commit_comment_visibility_change(self, *, is_private: bool) -> None:
        if is_private:
            self.session.commit()
            return
        self._commit_and_flush_process_notifications()

    def list_attachments(self, *, equipment_id: int) -> list[EquipmentAttachment]:
        self.get_equipment(equipment_id=equipment_id)
        return self.attachments.list_by_equipment(equipment_id=equipment_id)

    def create_attachment(
        self,
        *,
        equipment_id: int,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> EquipmentAttachment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = settings.attachment_storage_path / str(equipment.id)
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        relative_storage_path = str(file_path.relative_to(settings.attachment_storage_path))
        attachment = EquipmentAttachment(
            equipment_id=equipment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=relative_storage_path,
        )
        self.attachments.add(attachment)
        self._record_equipment_event(
            action="attachment_created",
            user=uploader,
            equipment=equipment,
            title=f"Добавлено вложение к прибору «{equipment.name}»",
            description=normalized_file_name,
        )
        self._commit_and_flush_process_notifications()
        self.session.refresh(attachment)
        return attachment

    def get_attachment_file(
        self,
        *,
        equipment_id: int,
        attachment_id: int,
    ) -> tuple[EquipmentAttachment, Path]:
        attachment = self._get_attachment(equipment_id=equipment_id, attachment_id=attachment_id)
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment file is missing.",
            )
        return attachment, file_path

    def delete_attachment(
        self,
        *,
        equipment_id: int,
        attachment_id: int,
        current_user: User,
    ) -> None:
        attachment = self._get_attachment(equipment_id=equipment_id, attachment_id=attachment_id)
        if (
            not has_admin_access(current_user.role)
            and attachment.uploaded_by_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this attachment.",
            )

        file_path = settings.attachment_storage_path / attachment.storage_path
        attachment_name = attachment.file_name
        equipment = self.get_equipment(equipment_id=equipment_id)
        self.attachments.delete(attachment)
        self._record_equipment_event(
            action="attachment_deleted",
            user=current_user,
            equipment=equipment,
            title=f"Удалено вложение у прибора «{equipment.name}»",
            description=attachment_name,
        )
        self._commit_and_flush_process_notifications()
        if file_path.exists() and file_path.is_file():
            file_path.unlink()

    def get_comment_attachment_file(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        attachment_id: int,
    ) -> tuple[EquipmentCommentAttachment, Path]:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        attachment = self._get_comment_attachment(
            comment_id=comment.id,
            attachment_id=attachment_id,
        )
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment attachment file is missing.",
            )
        return attachment, file_path

    def create_comment_attachment_upload(
        self,
        *,
        equipment_id: int,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> CommentAttachmentUpload:
        equipment = self.get_equipment(equipment_id=equipment_id)
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        staging_dir = _get_comment_attachment_upload_staging_dir(
            equipment_id=equipment.id,
            user_id=uploader.id,
        )
        staging_dir.mkdir(parents=True, exist_ok=True)
        _cleanup_stale_comment_attachment_uploads(staging_dir)

        upload_token = uuid4().hex
        storage_name = f"{upload_token}{Path(normalized_file_name).suffix.lower()}"
        file_path = staging_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )
        manifest_path = _get_comment_attachment_upload_manifest_path(
            staging_dir=staging_dir,
            upload_token=upload_token,
        )
        manifest_path.write_text(
            json.dumps(
                {
                    "file_name": normalized_file_name,
                    "file_mime_type": stored_file.content_type,
                    "file_size": stored_file.file_size,
                    "storage_name": storage_name,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        return CommentAttachmentUpload(
            upload_token=upload_token,
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
        )

    def delete_comment_attachment_upload(
        self,
        *,
        equipment_id: int,
        upload_token: str,
        current_user: User,
    ) -> None:
        self.get_equipment(equipment_id=equipment_id)
        staged_attachment = _load_comment_attachment_upload(
            equipment_id=equipment_id,
            user_id=current_user.id,
            upload_token=upload_token,
        )
        _delete_comment_attachment_upload_files(staged_attachment)

    def list_comments(self, *, equipment_id: int) -> list[EquipmentComment]:
        self.get_equipment(equipment_id=equipment_id)
        return self.comments.list_by_equipment(
            equipment_id=equipment_id,
            include_private=self._can_view_private_notes(),
        )

    def create_comment(
        self,
        *,
        equipment_id: int,
        payload: EquipmentCommentCreateRequest,
        author: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> EquipmentComment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        self._assert_private_note_creation_allowed(
            is_private=payload.is_private,
            current_user=author,
        )
        uploaded_files = files or []
        uploaded_attachment_tokens = list(
            dict.fromkeys(
                token
                for token in payload.uploaded_attachment_tokens
                if _normalize_optional_text(token) is not None
            )
        )
        normalized_text = _normalize_comment_text(
            payload.text,
            allow_empty=bool(uploaded_files or uploaded_attachment_tokens),
        )
        comment = EquipmentComment(
            equipment_id=equipment.id,
            author_user_id=author.id,
            author_display_name=_format_user_display_name(author),
            text=normalized_text,
            is_private=payload.is_private,
        )
        self.comments.add(comment)
        for upload_token in uploaded_attachment_tokens:
            self._attach_uploaded_comment_attachment(
                equipment=equipment,
                comment=comment,
                uploader=author,
                upload_token=upload_token,
            )
        for file_payload in uploaded_files:
            self._create_comment_attachment(
                equipment=equipment,
                comment=comment,
                uploader=author,
                file_payload=file_payload,
            )
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_created",
                user=author,
                equipment=equipment,
                title=f"Добавлен комментарий к прибору «{equipment.name}»",
                description=_build_message_event_description(
                    text=comment.text,
                    attachment_count=len(uploaded_files) + len(uploaded_attachment_tokens),
                ),
            )
        self._commit_comment_visibility_change(is_private=comment.is_private)
        comment = self._get_comment(equipment_id=equipment.id, comment_id=comment.id)
        self._send_equipment_comment_mentions(
            equipment=equipment,
            comment=comment,
            actor=author,
        )
        return comment

    def update_comment(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        payload: EquipmentCommentUpdateRequest,
        current_user: User,
    ) -> EquipmentComment:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        self._assert_comment_owner(comment=comment, current_user=current_user)
        previous_text = comment.text
        comment.text = _normalize_comment_text(payload.text)
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_updated",
                user=current_user,
                equipment=equipment,
                title=f"Обновлен комментарий к прибору «{equipment.name}»",
                description=_build_preview_description(comment.text),
            )
        self._commit_comment_visibility_change(is_private=comment.is_private)
        comment = self._get_comment(equipment_id=equipment.id, comment_id=comment.id)
        self._send_equipment_comment_mentions(
            equipment=equipment,
            comment=comment,
            actor=current_user,
            previous_text=previous_text,
        )
        return comment

    def delete_comment(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        current_user: User,
    ) -> None:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        self._assert_comment_delete_access(comment=comment, current_user=current_user)
        equipment = self.get_equipment(equipment_id=equipment_id)
        file_paths = [
            settings.attachment_storage_path / attachment.storage_path
            for attachment in comment.attachments
        ]
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_deleted",
                user=current_user,
                equipment=equipment,
                title=f"Удален комментарий у прибора «{equipment.name}»",
                description=_build_preview_description(comment.text),
            )
        self.comments.delete(comment)
        self._commit_comment_visibility_change(is_private=comment.is_private)
        for file_path in file_paths:
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def _send_equipment_comment_mentions(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        actor: User,
        previous_text: str | None = None,
    ) -> None:
        mentioned_users = self._resolve_mentioned_users(
            text=comment.text,
            exclude_user_id=actor.id,
            previous_text=previous_text,
        )
        if comment.is_private:
            mentioned_users = self._filter_private_mention_recipients(mentioned_users)
        if not mentioned_users:
            return

        target_url = f"{settings.frontend_app_url}/equipment/{equipment.id}?commentId={comment.id}"
        context_title = f"в карточке прибора «{equipment.name}»"
        self._send_mention_emails(
            users=mentioned_users,
            actor=actor,
            context_title=context_title,
            message_preview=comment.text,
            target_url=target_url,
        )

    def _create_comment_attachment(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> EquipmentCommentAttachment:
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = (
            settings.attachment_storage_path
            / "comment-attachments"
            / str(equipment.id)
            / str(comment.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        attachment = EquipmentCommentAttachment(
            equipment_comment_id=comment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.comment_attachments.add(attachment)
        return attachment

    def _attach_uploaded_comment_attachment(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        uploader: User,
        upload_token: str,
    ) -> EquipmentCommentAttachment:
        staged_attachment = _load_comment_attachment_upload(
            equipment_id=equipment.id,
            user_id=uploader.id,
            upload_token=upload_token,
        )
        storage_dir = (
            settings.attachment_storage_path
            / "comment-attachments"
            / str(equipment.id)
            / str(comment.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(staged_attachment.file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        shutil.move(str(staged_attachment.file_path), str(file_path))
        staged_attachment.manifest_path.unlink(missing_ok=True)

        attachment = EquipmentCommentAttachment(
            equipment_comment_id=comment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=staged_attachment.file_name,
            file_mime_type=staged_attachment.file_mime_type,
            file_size=staged_attachment.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.comment_attachments.add(attachment)
        return attachment

    def _get_attachment(self, *, equipment_id: int, attachment_id: int) -> EquipmentAttachment:
        self.get_equipment(equipment_id=equipment_id)
        attachment = self.attachments.get_by_id(attachment_id)
        if attachment is None or attachment.equipment_id != equipment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment not found.",
            )
        return attachment

    def _get_comment(self, *, equipment_id: int, comment_id: int) -> EquipmentComment:
        self.get_equipment(equipment_id=equipment_id)
        comment = self.comments.get_by_id(comment_id)
        if comment is None or comment.equipment_id != equipment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found.",
            )
        self._assert_private_note_visible(
            is_private=comment.is_private,
            detail="Comment not found.",
        )
        return comment

    def _get_comment_attachment(
        self,
        *,
        comment_id: int,
        attachment_id: int,
    ) -> EquipmentCommentAttachment:
        attachment = self.comment_attachments.get_by_id(attachment_id)
        if attachment is None or attachment.equipment_comment_id != comment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment attachment not found.",
            )
        return attachment

    def _assert_comment_owner(self, *, comment: EquipmentComment, current_user: User) -> None:
        if comment.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot modify this comment.",
            )

    def _assert_comment_delete_access(
        self,
        *,
        comment: EquipmentComment,
        current_user: User,
    ) -> None:
        if has_admin_access(current_user.role):
            return
        if comment.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this comment.",
            )
