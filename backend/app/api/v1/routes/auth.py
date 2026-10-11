from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.schemas.auth import (
    AuthActionResponse,
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
)
from app.schemas.user import UserProfileUpdateRequest, UserRead
from app.services import oidc_service
from app.services.auth_service import AuthService
from app.services.oidc_service import OidcError, OidcTransaction
from app.utils.security import (
    create_access_token,
    create_signed_payload,
    decode_signed_payload,
)

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user, token = AuthService(db).login(payload)
    AuthService(db)._sync_dashboard_folder_scope(user)
    return AuthResponse(access_token=token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser, db: DbSession) -> UserRead:
    AuthService(db)._sync_dashboard_folder_scope(current_user)
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    payload: UserProfileUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> UserRead:
    user = AuthService(db).update_profile(user=current_user, payload=payload)
    return UserRead.model_validate(user)


@router.post("/change-password", response_model=AuthActionResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).change_password(user=current_user, payload=payload)
    return AuthActionResponse(message="Password changed successfully.")


@router.post("/test-mention-email", response_model=AuthActionResponse)
async def test_mention_email(
    current_user: CurrentUser,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).send_test_mention_email(user=current_user)
    return AuthActionResponse(message="Тестовое письмо отправлено.")


# --------------------------------------------------------------------------- #
# Single sign-on (Authentik OIDC)
# --------------------------------------------------------------------------- #


@router.get("/oidc/status")
async def oidc_status() -> dict[str, bool]:
    """Whether the frontend should offer the "sign in with MKAIR" button."""

    return {"enabled": oidc_service.is_enabled()}


@router.get("/oidc/login")
async def oidc_login(redirect: str | None = None) -> RedirectResponse:
    """Start the SSO flow: remember the transaction in a signed cookie and go to Authentik."""

    try:
        url, transaction = oidc_service.build_login_url(redirect=redirect)
    except OidcError as exc:
        return RedirectResponse(oidc_service.frontend_error_url(exc.code), status_code=302)

    cookie = create_signed_payload(
        transaction,
        secret_key=settings.secret_key,
        ttl_seconds=settings.oidc_transaction_ttl_seconds,
    )
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        oidc_service.OIDC_COOKIE,
        cookie,
        max_age=settings.oidc_transaction_ttl_seconds,
        httponly=True,
        secure=settings.oidc_cookie_secure,
        samesite="lax",
        path=oidc_service.OIDC_COOKIE_PATH,
    )
    return response


@router.get("/oidc/callback")
async def oidc_callback(
    request: Request,
    db: DbSession,
    code: str = "",
    state: str = "",
) -> RedirectResponse:
    """Finish the SSO flow and hand the app's own session token back to the frontend."""

    cookie = request.cookies.get(oidc_service.OIDC_COOKIE)
    if not cookie:
        return RedirectResponse(oidc_service.frontend_error_url("missing_txn"), status_code=302)

    try:
        payload = decode_signed_payload(cookie, secret_key=settings.secret_key)
        transaction = OidcTransaction(
            state=str(payload["state"]),
            nonce=str(payload["nonce"]),
            code_verifier=str(payload["code_verifier"]),
            redirect=payload.get("redirect") if isinstance(payload.get("redirect"), str) else None,
        )
    except (KeyError, TypeError, ValueError):
        return RedirectResponse(oidc_service.frontend_error_url("bad_txn"), status_code=302)

    try:
        user, redirect = oidc_service.resolve_callback(
            session=db,
            code=code,
            state=state,
            transaction=transaction,
        )
    except OidcError as exc:
        return RedirectResponse(oidc_service.frontend_error_url(exc.code), status_code=302)

    AuthService(db)._sync_dashboard_folder_scope(user)
    token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        secret_key=settings.secret_key,
        ttl_hours=settings.access_token_ttl_hours,
    )
    response = RedirectResponse(
        oidc_service.frontend_success_url(token=token, redirect=redirect),
        status_code=302,
    )
    response.delete_cookie(oidc_service.OIDC_COOKIE, path=oidc_service.OIDC_COOKIE_PATH)
    return response
