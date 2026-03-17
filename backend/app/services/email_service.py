from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SentEmail:
    to_email: str
    subject: str
    body: str


email_outbox: list[SentEmail] = []


def clear_email_outbox() -> None:
    email_outbox.clear()


class EmailService:
    def send_verification_email(self, *, email: str, code: str) -> None:
        verification_url = f"{settings.frontend_app_url}/verify-email?email={email}&code={code}"
        body = (
            "Подтверждение email для metroLog\n\n"
            f"Код подтверждения: {code}\n"
            f"Ссылка: {verification_url}\n\n"
            "Если запрос был не ваш, просто проигнорируйте это письмо."
        )
        self._send_message(
            to_email=email,
            subject="metroLog: подтверждение email",
            body=body,
        )

    def send_password_reset_email(self, *, email: str, code: str) -> None:
        reset_url = f"{settings.frontend_app_url}/reset-password?email={email}&code={code}"
        body = (
            "Сброс пароля для metroLog\n\n"
            f"Код сброса: {code}\n"
            f"Ссылка: {reset_url}\n\n"
            "Если вы не запрашивали смену пароля, проигнорируйте это письмо."
        )
        self._send_message(
            to_email=email,
            subject="metroLog: сброс пароля",
            body=body,
        )

    def _send_message(self, *, to_email: str, subject: str, body: str) -> None:
        if settings.email_delivery_mode == "smtp":
            self._send_smtp_message(to_email=to_email, subject=subject, body=body)
        else:
            email_outbox.append(SentEmail(to_email=to_email, subject=subject, body=body))
            logger.info(
                "Email delivery mode is console. Email to %s\nSubject: %s\n\n%s",
                to_email,
                subject,
                body,
            )

    def _send_smtp_message(self, *, to_email: str, subject: str, body: str) -> None:
        if not settings.smtp_host:
            raise RuntimeError("SMTP host is not configured.")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_sender
        message["To"] = to_email
        message.set_content(body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
