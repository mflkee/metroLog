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
      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="hidden md:flex">
          <ThemeSwitcher />
        </div>
        <Link className="btn-secondary btn-sm hidden shrink-0 xl:inline-flex" to="/profile">
          Профиль
        </Link>
        {user ? (
          // Logout lives in this menu, so the top bar needs no separate «Выйти» button.
          <button
            className="btn-secondary btn-sm shrink-0"
            type="button"
            onClick={() => setMobileAccountOpen(true)}
          >
            Аккаунт
          </button>
        ) : (
          <Link className="btn-primary btn-sm shrink-0" to="/login">
            Войти
          </Link>
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
          <div className="md:hidden">
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
