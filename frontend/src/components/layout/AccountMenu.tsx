import { useState } from "react";
import { Link } from "react-router-dom";

import { Modal } from "@/components/Modal";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

export function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);

  function handleLogoutConfirm() {
    setLogoutConfirmOpen(false);
    setMobileAccountOpen(false);
    clearSession();
  }

  return (
    <>
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        <div className="hidden 2xl:flex">
          <ThemeSwitcher />
        </div>
        {user ? (
          <div className="hidden min-w-0 items-center gap-2 text-sm 2xl:flex">
            <span className="truncate font-semibold text-ink">{user.fullName}</span>
            <span className="text-steel">{roleLabels[user.role]}</span>
            {user.mustChangePassword ? (
              <span className="text-xs uppercase tracking-[0.14em] text-signal-info">смена пароля</span>
            ) : null}
          </div>
        ) : null}
        <Link className="btn-secondary btn-sm hidden shrink-0 2xl:inline-flex" to="/profile">
          Профиль
        </Link>
        {user ? (
          <button
            className="btn-danger btn-sm hidden shrink-0 2xl:inline-flex"
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
          >
            Выйти
          </button>
        ) : (
          <Link className="btn-primary btn-sm hidden shrink-0 2xl:inline-flex" to="/login">
            Войти
          </Link>
        )}
        {user ? (
          <button
            className="btn-secondary btn-sm shrink-0 2xl:hidden"
            type="button"
            onClick={() => setMobileAccountOpen(true)}
          >
            Аккаунт
          </button>
        ) : (
          <Link className="btn-primary btn-sm shrink-0 2xl:hidden" to="/login">
            Войти
          </Link>
        )}
        {!user ? null : (
          <div className="hidden min-w-0 text-xs text-steel xl:block 2xl:hidden">
            {roleLabels[user.role]}
          </div>
        )}
      </div>
      <Modal
        description={
          user
            ? `${user.fullName} · ${roleLabels[user.role]}`
            : "Управление текущей сессией."
        }
        open={mobileAccountOpen}
        size="sm"
        title="Аккаунт"
        onClose={() => setMobileAccountOpen(false)}
      >
        <div className="space-y-3">
          <div className="2xl:hidden">
            <ThemeSwitcher />
          </div>
          <Link
            className="btn-secondary w-full justify-center"
            to="/profile"
            onClick={() => setMobileAccountOpen(false)}
          >
            Профиль
          </Link>
          {user ? (
            <button
              className="btn-danger w-full justify-center"
              type="button"
              onClick={() => {
                setMobileAccountOpen(false);
                setLogoutConfirmOpen(true);
              }}
            >
              Выйти
            </button>
          ) : (
            <Link
              className="btn-primary w-full justify-center"
              to="/login"
              onClick={() => setMobileAccountOpen(false)}
            >
              Войти
            </Link>
          )}
        </div>
      </Modal>
      <Modal
        description="Текущая сессия будет завершена, и приложение вернет вас на экран входа."
        open={logoutConfirmOpen}
        size="sm"
        title="Выйти из аккаунта?"
        onClose={() => setLogoutConfirmOpen(false)}
      >
        <div className="flex justify-end gap-3">
          <button
            className="btn-secondary btn-sm"
            type="button"
            onClick={() => setLogoutConfirmOpen(false)}
          >
            Отмена
          </button>
          <button
            className="btn-danger btn-sm"
            type="button"
            onClick={handleLogoutConfirm}
          >
            Выйти
          </button>
        </div>
      </Modal>
    </>
  );
}
