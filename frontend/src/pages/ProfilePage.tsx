import { FormEvent, useState } from "react";

import { changePassword, getCurrentUser, updateProfile } from "@/api/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  blockPasswordClipboard,
  isPasswordPolicyValid,
  passwordPolicyMessage,
} from "@/lib/password";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [facility, setFacility] = useState(user?.facility ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    if (!token) {
      setProfileError("Сессия неактивна. Войди заново.");
      return;
    }

    setIsProfileSubmitting(true);

    try {
      const updatedUser = await updateProfile(token, { phone, position, facility });
      setUser(updatedUser);
      setPhone(updatedUser.phone ?? "");
      setPosition(updatedUser.position ?? "");
      setFacility(updatedUser.facility ?? "");
      setProfileMessage("Профиль обновлен.");
    } catch (submitError) {
      setProfileError(
        submitError instanceof Error ? submitError.message : "Не удалось обновить профиль.",
      );
    } finally {
      setIsProfileSubmitting(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Сессия неактивна. Войди заново.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Новый пароль и подтверждение не совпадают.");
      return;
    }

    if (!isPasswordPolicyValid(newPassword)) {
      setError(passwordPolicyMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await changePassword(token, {
        currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      const refreshedUser = await getCurrentUser(token);
      setUser(refreshedUser);
      setPhone(refreshedUser.phone ?? "");
      setPosition(refreshedUser.position ?? "");
      setFacility(refreshedUser.facility ?? "");
      setMessage(response.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось сменить пароль.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Профиль"
        description="Учетная страница с базовой информацией и сменой пароля."
      />
      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        {user ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <dl className="grid gap-3 text-sm text-steel">
              <div>
                <dt className="font-semibold text-ink">Пользователь</dt>
                <dd>{user.displayName}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Роль</dt>
                <dd>{roleLabels[user.role]}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Требуется смена пароля</dt>
                <dd>{user.mustChangePassword ? "Да" : "Нет"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Статус</dt>
                <dd>{user.isActive ? "Активен" : "Отключен"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Телефон</dt>
                <dd>{user.phone || "Не указан"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Должность</dt>
                <dd>{user.position || "Не указана"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Объект</dt>
                <dd>{user.facility || "Не указан"}</dd>
              </div>
            </dl>

            <div className="space-y-4">
              <form
                className="space-y-4 rounded-2xl border border-line bg-white/85 p-4"
                onSubmit={handleSaveProfile}
              >
                <div>
                  <h3 className="text-base font-semibold text-ink">Данные профиля</h3>
                  <p className="mt-1 text-sm text-steel">
                    Телефон можно вводить в любом формате. Должность и объект сохраняются как рабочие подписи профиля.
                  </p>
                </div>

                <label className="block text-sm text-steel">
                  Телефон
                  <input
                    className="form-input"
                    type="text"
                    placeholder="+7 (999) 123-45-67"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>

                <label className="block text-sm text-steel">
                  Должность
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Инженер-метролог"
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                  />
                </label>

                <label className="block text-sm text-steel">
                  Объект
                  <input
                    className="form-input"
                    type="text"
                    placeholder='ПСП ХАЛ "Северный"'
                    value={facility}
                    onChange={(event) => setFacility(event.target.value)}
                  />
                </label>

                {profileError ? <p className="text-sm text-[#b04c43]">{profileError}</p> : null}
                {profileMessage ? <p className="text-sm text-signal-ok">{profileMessage}</p> : null}

                <button
                  className="btn-primary disabled:opacity-60"
                  type="submit"
                  disabled={isProfileSubmitting}
                >
                  {isProfileSubmitting ? "Сохраняем..." : "Сохранить профиль"}
                </button>
              </form>

              <form
                className="space-y-4 rounded-2xl border border-line bg-white/85 p-4"
                onSubmit={handleChangePassword}
              >
                <div>
                  <h3 className="text-base font-semibold text-ink">Смена пароля</h3>
                <p className="mt-1 text-sm text-steel">
                  {user.mustChangePassword
                    ? "Временный пароль еще активен. Смена пароля обязательна перед дальнейшей работой."
                    : "Стандартная смена пароля через текущий пароль и новое подтверждение."}
                </p>
                </div>

                <label className="block text-sm text-steel">
                  Текущий пароль
                  <input
                    className="form-input"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    onCopy={blockPasswordClipboard}
                    onCut={blockPasswordClipboard}
                    onPaste={blockPasswordClipboard}
                  />
                </label>

                <label className="block text-sm text-steel">
                  Новый пароль
                  <input
                    className="form-input"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    onCopy={blockPasswordClipboard}
                    onCut={blockPasswordClipboard}
                    onPaste={blockPasswordClipboard}
                  />
                </label>

                <label className="block text-sm text-steel">
                  Подтверждение нового пароля
                  <input
                    className="form-input"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onCopy={blockPasswordClipboard}
                    onCut={blockPasswordClipboard}
                    onPaste={blockPasswordClipboard}
                  />
                </label>

                <p className="text-xs text-steel">{passwordPolicyMessage}</p>
                {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
                {message ? <p className="text-sm text-signal-ok">{message}</p> : null}

                <button className="btn-primary disabled:opacity-60" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Сохраняем..." : "Сменить пароль"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <p className="text-sm text-steel">
            Данные профиля загружаются после проверки текущей сессии.
          </p>
        )}
      </div>
    </section>
  );
}
