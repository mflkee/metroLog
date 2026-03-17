import { FormEvent, useState } from "react";

import { changePassword, getCurrentUser, updateProfile } from "@/api/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { isPasswordPolicyValid, passwordPolicyMessage } from "@/lib/password";
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
  const [organization, setOrganization] = useState(user?.organization ?? "");
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
      const updatedUser = await updateProfile(token, { phone, organization, position, facility });
      setUser(updatedUser);
      setPhone(updatedUser.phone ?? "");
      setOrganization(updatedUser.organization ?? "");
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
      setOrganization(refreshedUser.organization ?? "");
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
            <dl className="overflow-hidden rounded-2xl border border-line bg-white/85">
              {[
                ["Фамилия", user.lastName || "Не указана"],
                ["Имя", user.firstName || "Не указано"],
                ["Отчество", user.patronymic || "Не указано"],
                ["Email", user.email],
                ["Роль", roleLabels[user.role]],
                ["Требуется смена пароля", user.mustChangePassword ? "Да" : "Нет"],
                ["Статус", user.isActive ? "Активен" : "Отключен"],
                ["Телефон", user.phone || "Не указан"],
                ["Организация", user.organization || "Не указана"],
                ["Должность", user.position || "Не указана"],
                ["Объект", user.facility || "Не указан"],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={[
                    "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4",
                    index > 0 ? "border-t border-line" : "",
                  ].join(" ")}
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                    {label}
                  </dt>
                  <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-4">
              <form
                className="space-y-4 rounded-2xl border border-line bg-white/85 p-4"
                onSubmit={handleSaveProfile}
              >
                <div>
                  <h3 className="text-base font-semibold text-ink">Данные профиля</h3>
                  <p className="mt-1 text-sm text-steel">
                    Телефон можно вводить в любом формате. Организация, должность и объект сохраняются как рабочие подписи профиля.
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
                  Организация
                  <input
                    className="form-input"
                    type="text"
                    placeholder='ООО "МКАИР-ИТ"'
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
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

                <PasswordInput
                  autoComplete="current-password"
                  label="Текущий пароль"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />

                <PasswordInput
                  autoComplete="new-password"
                  label="Новый пароль"
                  minLength={6}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />

                <PasswordInput
                  autoComplete="new-password"
                  label="Подтверждение нового пароля"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />

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
