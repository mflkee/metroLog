from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationConfigurationError(RuntimeError):
    pass


class NotificationDeliveryError(RuntimeError):
    pass


class NotificationService:
    def send_mention_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str,
        actor_name: str,
        context_title: str,
        message_preview: str | None,
        target_url: str,
    ) -> None:
        if not self._is_enabled:
            return

        if not recipient_email.strip():
            return

        subject = f"Вас упомянули: {context_title}"
        preview = (message_preview or "").strip() or "Без текста."

        text_content = "\n".join(
            [
                f"{recipient_name},",
                "",
                f"Пользователь {actor_name} упомянул вас: {context_title}.",
                "",
                f"Сообщение: {preview}",
                "",
                f"Открыть: {target_url}",
            ]
        )

        html_content = "\n".join(
            [
                f"<p>{recipient_name},</p>",
                (
                    "<p>Пользователь "
                    f"<strong>{actor_name}</strong> упомянул вас: "
                    f"<strong>{context_title}</strong>.</p>"
                ),
                f"<p><strong>Сообщение:</strong> {escape_html(preview)}</p>",
                f'<p><a href="{escape_html(target_url)}">Открыть запись</a></p>',
            ]
        )

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((settings.smtp_from_name, self._sender_email))
        message["To"] = recipient_email.strip()
        message.set_content(text_content)
        message.add_alternative(html_content, subtype="html")

        try:
            self._send_message(message)
        except Exception:
            logger.exception("Failed to send mention email to %s", recipient_email)

    def send_test_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str,
    ) -> None:
        normalized_email = recipient_email.strip()
        if not normalized_email:
            raise NotificationConfigurationError(
                "У текущего пользователя не указана почта для тестового письма."
            )

        self._ensure_configured()

        subject = "Тестовое письмо metroLog"
        text_content = "\n".join(
            [
                f"{recipient_name},",
                "",
                "Это тестовое письмо от metroLog.",
                "Если ты видишь это сообщение, SMTP-настройки работают корректно.",
            ]
        )
        html_content = "\n".join(
            [
                f"<p>{recipient_name},</p>",
                "<p>Это тестовое письмо от <strong>metroLog</strong>.</p>",
                "<p>Если ты видишь это сообщение, SMTP-настройки работают корректно.</p>",
            ]
        )

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((settings.smtp_from_name, self._sender_email))
        message["To"] = normalized_email
        message.set_content(text_content)
        message.add_alternative(html_content, subtype="html")

        try:
            self._send_message(message)
        except Exception as exc:
            raise NotificationDeliveryError(
                f"Не удалось отправить тестовое письмо: {exc}"
            ) from exc

    @property
    def _is_enabled(self) -> bool:
        return bool(
            settings.mention_notifications_enabled
            and settings.smtp_host
            and settings.smtp_username
            and settings.smtp_password
            and self._sender_email
        )

    @property
    def _sender_email(self) -> str:
        return (settings.smtp_from_email or settings.smtp_username or "").strip()

    def _ensure_configured(self) -> None:
        missing_fields: list[str] = []
        if not settings.mention_notifications_enabled:
            missing_fields.append("MENTION_NOTIFICATIONS_ENABLED")
        if not settings.smtp_host:
            missing_fields.append("SMTP_HOST")
        if not settings.smtp_username:
            missing_fields.append("SMTP_USERNAME")
        if not settings.smtp_password:
            missing_fields.append("SMTP_PASSWORD")
        if not self._sender_email:
            missing_fields.append("SMTP_FROM_EMAIL")

        if missing_fields:
            raise NotificationConfigurationError(
                "Почтовые уведомления не настроены. Не хватает: "
                + ", ".join(missing_fields)
                + "."
            )

    def _send_message(self, message: EmailMessage) -> None:
        self._ensure_configured()
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as client:
            client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
