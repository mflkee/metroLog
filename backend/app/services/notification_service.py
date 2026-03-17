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
    def ensure_configured(self) -> None:
        self._ensure_transport_configured()

    def send_temporary_password_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str,
        temporary_password: str,
    ) -> None:
        normalized_email = recipient_email.strip()
        if not normalized_email:
            raise NotificationConfigurationError(
                "У нового пользователя не указана почта для отправки временного пароля."
            )

        self._ensure_transport_configured()

        subject = "Доступ в metroLog"
        login_url = f"{settings.frontend_app_url.rstrip('/')}/login"
        text_content = "\n".join(
            [
                f"{recipient_name},",
                "",
                "Для вас создана учетная запись в metroLog.",
                f"Временный пароль: {temporary_password}",
                "",
                f"Вход: {login_url}",
                "После первого входа система попросит сменить пароль.",
            ]
        )
        html_content = "\n".join(
            [
                f"<p>{recipient_name},</p>",
                "<p>Для вас создана учетная запись в <strong>metroLog</strong>.</p>",
                (f"<p><strong>Временный пароль:</strong> {escape_html(temporary_password)}</p>"),
                (f'<p><a href="{escape_html(login_url)}">Открыть страницу входа</a></p>'),
                "<p>После первого входа система попросит сменить пароль.</p>",
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
                f"Не удалось отправить письмо с временным паролем: {exc}"
            ) from exc

    def send_process_update_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str,
        actor_name: str,
        process_label: str,
        event_title: str,
        event_description: str | None,
        target_url: str,
    ) -> None:
        if not self._is_enabled:
            return

        normalized_email = recipient_email.strip()
        if not normalized_email:
            return

        description = (event_description or "").strip() or (
            "Подробности доступны в карточке прибора."
        )
        subject = f"Обновление по {process_label}"
        text_content = "\n".join(
            [
                f"{recipient_name},",
                "",
                f"Появилось новое обновление по {process_label}.",
                f"Событие: {event_title}",
                f"Инициатор: {actor_name}",
                "",
                f"Подробности: {description}",
                "",
                f"Открыть: {target_url}",
            ]
        )
        html_content = "\n".join(
            [
                f"<p>{recipient_name},</p>",
                (
                    "<p>Появилось новое обновление по "
                    f"<strong>{escape_html(process_label)}</strong>.</p>"
                ),
                f"<p><strong>Событие:</strong> {escape_html(event_title)}</p>",
                f"<p><strong>Инициатор:</strong> {escape_html(actor_name)}</p>",
                f"<p><strong>Подробности:</strong> {escape_html(description)}</p>",
                f'<p><a href="{escape_html(target_url)}">Открыть запись</a></p>',
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
        except Exception:
            logger.exception("Failed to send process update email to %s", normalized_email)

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

        self._ensure_transport_configured()

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
            raise NotificationDeliveryError(f"Не удалось отправить тестовое письмо: {exc}") from exc

    def send_equipment_share_email(
        self,
        *,
        recipient_email: str,
        recipient_name: str,
        sender_name: str,
        equipment_name: str,
        equipment_modification: str | None,
        equipment_serial_number: str | None,
        folder_name: str | None,
        target_url: str,
    ) -> None:
        normalized_email = recipient_email.strip()
        if not normalized_email:
            raise NotificationConfigurationError(
                "У выбранного пользователя не указана почта для отправки ссылки."
            )

        self._ensure_transport_configured()

        equipment_label = equipment_name.strip() or "Прибор"
        modification = (equipment_modification or "").strip()
        serial_number = (equipment_serial_number or "").strip()
        folder_label = (folder_name or "").strip()

        detail_lines: list[str] = []
        if modification:
            detail_lines.append(f"Модификация: {modification}")
        if serial_number:
            detail_lines.append(f"Заводской номер: {serial_number}")
        if folder_label:
            detail_lines.append(f"Папка: {folder_label}")

        subject = f"Ссылка на прибор в metroLog: {equipment_label}"
        text_lines = [
            f"{recipient_name},",
            "",
            f"Пользователь {sender_name} поделился с вами ссылкой на прибор в metroLog.",
            f"Прибор: {equipment_label}",
        ]
        if detail_lines:
            text_lines.extend(["", *detail_lines])
        text_lines.extend(["", f"Открыть: {target_url}"])
        text_content = "\n".join(text_lines)

        html_lines = [
            f"<p>{recipient_name},</p>",
            (
                "<p>Пользователь "
                f"<strong>{escape_html(sender_name)}</strong> поделился с вами ссылкой на прибор в "
                "<strong>metroLog</strong>.</p>"
            ),
            f"<p><strong>Прибор:</strong> {escape_html(equipment_label)}</p>",
        ]
        if detail_lines:
            html_lines.append("<ul>")
            for detail_line in detail_lines:
                label, _, value = detail_line.partition(": ")
                html_lines.append(
                    f"<li><strong>{escape_html(label)}:</strong> {escape_html(value)}</li>"
                )
            html_lines.append("</ul>")
        html_lines.append(
            f'<p><a href="{escape_html(target_url)}">Открыть карточку прибора</a></p>'
        )
        html_content = "\n".join(html_lines)

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
                f"Не удалось отправить ссылку на прибор: {exc}"
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

    def _ensure_transport_configured(self) -> None:
        missing_fields: list[str] = []
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
                "Почтовые уведомления не настроены. Не хватает: " + ", ".join(missing_fields) + "."
            )

    def _send_message(self, message: EmailMessage) -> None:
        self._ensure_transport_configured()
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as client:
            client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )
