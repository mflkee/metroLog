import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { UserRole } from "@/api/auth";
import { createUser, fetchUsers, resetUserPassword, updateUser } from "@/api/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

const roleOrder: UserRole[] = ["ADMINISTRATOR", "MKAIR", "CUSTOMER"];
const defaultRole: UserRole = "CUSTOMER";

type CredentialPacket = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  reason: "create" | "reset";
};

export function AdminUsersPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [isActive, setIsActive] = useState(true);
  const [credentialPacket, setCredentialPacket] = useState<CredentialPacket | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const createUserMutation = useMutation({
    mutationFn: (payload: {
      firstName: string;
      lastName: string;
      patronymic: string;
      email: string;
      role: UserRole;
      isActive: boolean;
    }) => createUser(token ?? "", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: number;
      payload: { role?: UserRole; isActive?: boolean };
    }) => updateUser(token ?? "", userId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: number) => resetUserPassword(token ?? "", userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const sortedUsers = useMemo(
    () =>
      usersQuery.data
        ? [...usersQuery.data].sort((left, right) => left.fullName.localeCompare(right.fullName))
        : [],
    [usersQuery.data],
  );

  if (!token) {
    return null;
  }

  async function copyTemporaryPassword() {
    if (!credentialPacket) {
      return;
    }

    try {
      await navigator.clipboard.writeText(credentialPacket.temporaryPassword);
      setCopyMessage("Временный пароль скопирован.");
    } catch {
      setCopyMessage("Не удалось скопировать пароль автоматически.");
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCredentialPacket(null);
    setCopyMessage(null);

    try {
      const response = await createUserMutation.mutateAsync({
        firstName,
        lastName,
        patronymic,
        email,
        role,
        isActive,
      });
      setCredentialPacket({
        fullName: response.user.fullName,
        email: response.user.email,
        temporaryPassword: response.temporaryPassword,
        reason: "create",
      });
      setLastName("");
      setFirstName("");
      setPatronymic("");
      setEmail("");
      setRole(defaultRole);
      setIsActive(true);
    } catch {
      // error is rendered by the mutation block
    }
  }

  async function handleResetPassword(userId: number, userFullName: string, userEmail: string) {
    setCredentialPacket(null);
    setCopyMessage(null);

    try {
      const response = await resetPasswordMutation.mutateAsync(userId);
      setCredentialPacket({
        fullName: userFullName,
        email: userEmail,
        temporaryPassword: response.temporaryPassword,
        reason: "reset",
      });
    } catch {
      // error is rendered by the mutation block
    }
  }

  return (
    <section>
      <PageHeader
        title="Пользователи"
        description="Администратор создает учетные записи, назначает роли и выдает временные пароли."
      />

      <div className="space-y-5 rounded-3xl border border-line bg-white p-5 shadow-panel">
        <form
          className="grid gap-4 rounded-2xl border border-line bg-white/85 p-4 lg:grid-cols-[1fr_1fr_1fr_1.2fr_220px_auto]"
          onSubmit={handleCreateUser}
        >
          <label className="block text-sm text-steel">
            Фамилия
            <input
              className="form-input"
              type="text"
              placeholder="Иванов"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>

          <label className="block text-sm text-steel">
            Имя
            <input
              className="form-input"
              type="text"
              placeholder="Иван"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>

          <label className="block text-sm text-steel">
            Отчество
            <input
              className="form-input"
              type="text"
              placeholder="Иванович"
              value={patronymic}
              onChange={(event) => setPatronymic(event.target.value)}
            />
          </label>

          <label className="block text-sm text-steel">
            Email
            <input
              className="form-input"
              type="email"
              placeholder="user@mkair.ru"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block text-sm text-steel">
            Роль
            <select
              className="form-input"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              {roleOrder.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {roleLabels[roleOption]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col justify-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-steel">
              <input
                checked={isActive}
                type="checkbox"
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Активный пользователь
            </label>
            <button
              aria-label="Создать пользователя"
              className="btn-primary disabled:opacity-60"
              type="submit"
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? (
                "…"
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {credentialPacket ? (
          <section className="rounded-2xl border border-signal-info bg-[#eaf4f8] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">
                  {credentialPacket.reason === "create"
                    ? "Пользователь создан."
                    : "Временный пароль обновлен."}
                </p>
                <p className="text-sm text-steel">
                  {credentialPacket.fullName} · {credentialPacket.email}
                </p>
                <p className="font-mono text-sm text-ink">{credentialPacket.temporaryPassword}</p>
                <p className="text-xs text-steel">
                  Передай этот пароль пользователю безопасным способом. При первом входе пароль нужно будет сменить.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className="rounded-full border border-signal-info px-4 py-2 text-sm text-ink transition hover:border-line"
                  type="button"
                  onClick={() => void copyTemporaryPassword()}
                >
                  Скопировать пароль
                </button>
                {copyMessage ? <p className="text-xs text-steel">{copyMessage}</p> : null}
              </div>
            </div>
          </section>
        ) : null}

        {usersQuery.isLoading ? (
          <p className="text-sm text-steel">Загружаем список пользователей...</p>
        ) : null}

        {usersQuery.isError ? (
          <p className="text-sm text-[#b04c43]">
            {usersQuery.error instanceof Error
              ? usersQuery.error.message
              : "Не удалось загрузить пользователей."}
          </p>
        ) : null}

        {createUserMutation.isError ? (
          <p className="mb-4 text-sm text-[#b04c43]">
            {createUserMutation.error instanceof Error
              ? createUserMutation.error.message
              : "Не удалось создать пользователя."}
          </p>
        ) : null}

        {updateUserMutation.isError ? (
          <p className="mb-4 text-sm text-[#b04c43]">
            {updateUserMutation.error instanceof Error
              ? updateUserMutation.error.message
              : "Не удалось обновить пользователя."}
          </p>
        ) : null}

        {resetPasswordMutation.isError ? (
          <p className="mb-4 text-sm text-[#b04c43]">
            {resetPasswordMutation.error instanceof Error
              ? resetPasswordMutation.error.message
              : "Не удалось сбросить пароль."}
          </p>
        ) : null}

        {sortedUsers.length > 0 ? (
          <div className="space-y-4">
            {sortedUsers.map((user) => {
              const isUpdatingUser =
                updateUserMutation.isPending && updateUserMutation.variables?.userId === user.id;
              const isResettingPassword =
                resetPasswordMutation.isPending && resetPasswordMutation.variables === user.id;

              return (
                <article
                  key={user.id}
                  className="rounded-2xl border border-line bg-white/85 p-4 shadow-panel"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="text-lg font-semibold text-ink transition hover:text-signal-info"
                          to={currentUser?.id === user.id ? "/profile" : `/admin/users/${user.id}`}
                        >
                          {user.fullName}
                        </Link>
                        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-steel">
                          {roleLabels[user.role]}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                            user.isActive
                              ? "bg-[#edf2f5] text-steel"
                              : "bg-[#f3e1de] text-[#b04c43]",
                          ].join(" ")}
                        >
                          {user.isActive ? "Активен" : "Отключен"}
                        </span>
                        {user.mustChangePassword ? (
                          <span className="rounded-full bg-[#eaf4f8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal-info">
                            Временный пароль
                          </span>
                        ) : null}
                        {currentUser?.id === user.id ? (
                          <span className="rounded-full bg-[#eaf4f8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal-info">
                            Вы
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-steel">{user.email}</p>
                      <p className="text-xs text-steel">
                        {user.position || "Должность не указана"} ·{" "}
                        {user.phone || "Телефон не указан"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {roleOrder.map((roleOption) => (
                        <button
                          key={roleOption}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm transition",
                            user.role === roleOption
                              ? "border-signal-info bg-[#eaf4f8] text-ink"
                              : "border-line bg-white text-steel hover:border-signal-info hover:text-ink",
                          ].join(" ")}
                          type="button"
                          disabled={isUpdatingUser}
                          onClick={() =>
                            updateUserMutation.mutate({
                              userId: user.id,
                              payload: { role: roleOption },
                            })
                          }
                        >
                          {isUpdatingUser && updateUserMutation.variables?.payload.role === roleOption
                            ? "Сохраняем..."
                            : roleLabels[roleOption]}
                        </button>
                      ))}
                      <button
                        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink disabled:opacity-60"
                        type="button"
                        disabled={isUpdatingUser}
                        onClick={() =>
                          updateUserMutation.mutate({
                            userId: user.id,
                            payload: { isActive: !user.isActive },
                          })
                        }
                      >
                        {isUpdatingUser &&
                        updateUserMutation.variables?.payload.isActive === !user.isActive
                          ? "Сохраняем..."
                          : user.isActive
                            ? "Отключить"
                            : "Включить"}
                      </button>
                      <button
                        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink disabled:opacity-60"
                        type="button"
                        disabled={isResettingPassword}
                        onClick={() => handleResetPassword(user.id, user.fullName, user.email)}
                      >
                        {isResettingPassword ? "Сбрасываем..." : "Сбросить пароль"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
