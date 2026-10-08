import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { UserRole } from "@/api/auth";
import { fetchEquipmentFolders } from "@/api/equipment";
import { createUser, deleteUser, fetchUsers, resetUserPassword, updateUser } from "@/api/users";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Switch } from "@/components/ui/switch";
import { isDeveloperRole, roleLabels } from "@/lib/roles";
import { buildUserExtraInfo, matchesUserSearch, userSearchPlaceholder } from "@/lib/userSearch";
import { useAuthStore } from "@/store/auth";

const roleOrder: UserRole[] = ["DEVELOPER", "ADMINISTRATOR", "MKAIR", "CUSTOMER"];
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
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [accessFolderIds, setAccessFolderIds] = useState<number[]>([]);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const canAssignDeveloperRole = isDeveloperRole(currentUser?.role);
  const assignableRoles = useMemo(
    () => (canAssignDeveloperRole ? roleOrder : roleOrder.filter((roleItem) => roleItem !== "DEVELOPER")),
    [canAssignDeveloperRole],
  );

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "admin-users"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
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

  const updateFolderAccessMutation = useMutation({
    mutationFn: ({
      userId,
      allowedFolderIds,
    }: {
      userId: number;
      allowedFolderIds: number[];
    }) =>
      updateUser(token ?? "", userId, {
        allowedFolderIds,
      }),
    onSuccess: () => {
      setAccessMessage("Доступ к папкам обновлен.");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(token ?? "", userId),
    onSuccess: () => {
      setDeleteMessage("Пользователь удален.");
      setCredentialPacket(null);
      setCopyMessage(null);
      setDeleteUserId(null);
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
  const visibleUsers = useMemo(
    () => sortedUsers.filter((user) => matchesUserSearch(user, usersSearchQuery)),
    [sortedUsers, usersSearchQuery],
  );
  const expandedUser = useMemo(
    () => sortedUsers.find((user) => user.id === expandedUserId) ?? null,
    [expandedUserId, sortedUsers],
  );
  const selectedDeleteUser = useMemo(
    () => sortedUsers.find((user) => user.id === deleteUserId) ?? null,
    [deleteUserId, sortedUsers],
  );
  const isAccessDirty = useMemo(
    () => !haveSameNumberSet(expandedUser?.allowedFolderIds ?? [], accessFolderIds),
    [accessFolderIds, expandedUser?.allowedFolderIds],
  );

  useEffect(() => {
    if (deleteUserId && !sortedUsers.some((user) => user.id === deleteUserId)) {
      setDeleteUserId(null);
    }
  }, [deleteUserId, sortedUsers]);

  useEffect(() => {
    if (expandedUserId && !sortedUsers.some((user) => user.id === expandedUserId)) {
      setExpandedUserId(null);
      setAccessFolderIds([]);
      setAccessMessage(null);
    }
  }, [expandedUserId, sortedUsers]);

  useEffect(() => {
    setAccessFolderIds(expandedUser?.allowedFolderIds ?? []);
    setAccessMessage(null);
  }, [expandedUser?.allowedFolderIds, expandedUser?.id]);

  useEffect(() => {
    if (!canAssignDeveloperRole && role === "DEVELOPER") {
      setRole(defaultRole);
    }
  }, [canAssignDeveloperRole, role]);

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

  function toggleAccessFolder(folderId: number) {
    setAccessMessage(null);
    setAccessFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((value) => value !== folderId)
        : [...current, folderId].sort((left, right) => left - right),
    );
  }

  async function handleSaveFolderAccess() {
    if (!expandedUser) {
      return;
    }

    setAccessMessage(null);
    await updateFolderAccessMutation.mutateAsync({
      userId: expandedUser.id,
      allowedFolderIds: accessFolderIds,
    });
  }

  function toggleUserCard(userId: number) {
    setAccessMessage(null);
    setExpandedUserId((current) => (current === userId ? null : userId));
  }

  async function handleDeleteUser() {
    if (deleteUserId === null) {
      return;
    }
    setDeleteMessage(null);
    await deleteUserMutation.mutateAsync(deleteUserId);
  }

  return (
    <section>
      <PageHeader
        title="Пользователи"
        description="Разработчик и администратор управляют учетными записями, ролями и временными паролями."
      />

      <div className="space-y-5">
        <section className="tone-parent space-y-4 rounded-3xl border border-line p-5 shadow-panel">
          <div>
            <h2 className="text-lg font-semibold text-ink">Добавление пользователя</h2>
            <p className="mt-1 max-w-[72ch] text-sm text-steel">
              Создай новую учетную запись и сразу выбери роль. Временный пароль будет сгенерирован автоматически.
            </p>
          </div>

          <form
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr_220px_1fr]"
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
                {assignableRoles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleLabels[roleOption]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col justify-end gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-steel" htmlFor="create-user-active">
                <Switch checked={isActive} id="create-user-active" onCheckedChange={setIsActive} />
                Активный пользователь
              </label>
              <button
                className="btn-primary disabled:opacity-60"
                type="submit"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? "Добавляем..." : "Добавить пользователя"}
              </button>
            </div>
          </form>

          {createUserMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {createUserMutation.error instanceof Error
                ? createUserMutation.error.message
                : "Не удалось создать пользователя."}
            </p>
          ) : null}
        </section>

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

        <section className="tone-parent space-y-4 rounded-3xl border border-line p-5 shadow-panel">
          <div>
            <h2 className="text-lg font-semibold text-ink">Управление пользователями</h2>
            <p className="mt-1 max-w-[72ch] text-sm text-steel">
              Раскрой карточку пользователя, чтобы изменить роль, активность, сбросить пароль и при необходимости настроить доступ к папкам.
            </p>
          </div>

          {updateUserMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {updateUserMutation.error instanceof Error
                ? updateUserMutation.error.message
                : "Не удалось обновить пользователя."}
            </p>
          ) : null}

          {resetPasswordMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {resetPasswordMutation.error instanceof Error
                ? resetPasswordMutation.error.message
                : "Не удалось сбросить пароль."}
            </p>
          ) : null}

          {deleteUserMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {deleteUserMutation.error instanceof Error
                ? deleteUserMutation.error.message
                : "Не удалось удалить пользователя."}
            </p>
          ) : null}

          {deleteMessage ? <p className="text-sm text-steel">{deleteMessage}</p> : null}

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

          {!usersQuery.isLoading && !usersQuery.isError ? (
            <>
              <label className="block text-sm text-steel">
                Поиск по пользователям
                <input
                  className="form-input"
                  type="text"
                  placeholder={userSearchPlaceholder}
                  value={usersSearchQuery}
                  onChange={(event) => setUsersSearchQuery(event.target.value)}
                />
              </label>

              {!visibleUsers.length ? (
                <p className="text-sm text-steel">По этому запросу пользователи не найдены.</p>
              ) : null}

              <div className="space-y-4">
                {visibleUsers.map((user) => {
                  const isExpanded = expandedUserId === user.id;
                  const canManageFolderAccess = user.role === "CUSTOMER" || user.role === "MKAIR";
                  const folderAccessSelection = isExpanded ? accessFolderIds : (user.allowedFolderIds ?? []);
                  const shouldWarnAboutDashboardFolders = isExpanded && (
                    user.dashboardFolderIds?.some((folderId) => !folderAccessSelection.includes(folderId))
                    ?? (user.dashboardFolderId
                      ? !folderAccessSelection.includes(user.dashboardFolderId)
                      : false)
                  );
              const isUpdatingUser =
                updateUserMutation.isPending && updateUserMutation.variables?.userId === user.id;
              const isResettingPassword =
                resetPasswordMutation.isPending && resetPasswordMutation.variables === user.id;
              const isDeleteTarget = deleteUserId === user.id;
              const isProtectedDeveloper = user.role === "DEVELOPER" && !canAssignDeveloperRole;
              const roleActionDisabled = isUpdatingUser || isProtectedDeveloper;
              const accountActionDisabled = isUpdatingUser || isResettingPassword || isProtectedDeveloper;
              const canDeleteUserAccount = currentUser?.id !== user.id && user.role !== "DEVELOPER";

              return (
                <article
                  key={user.id}
                  className="tone-child overflow-hidden rounded-2xl border border-line shadow-panel"
                >
                  <button
                    aria-expanded={isExpanded}
                    className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-black/5"
                    type="button"
                    onClick={() => toggleUserCard(user.id)}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold text-ink">{user.fullName}</span>
                        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-steel">
                          {roleLabels[user.role]}
                        </span>
                        {user.role === "DEVELOPER" ? (
                          <span className="rounded-full bg-[#eaf4f8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal-info">
                            Защищенная роль
                          </span>
                        ) : null}
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
                      {buildUserExtraInfo(user) ? (
                        <p className="text-xs text-steel">{buildUserExtraInfo(user)}</p>
                      ) : null}
                      <p className="text-xs text-steel">
                        {user.position || "Должность не указана"} · {user.phone || "Телефон не указан"}
                      </p>
                      {canManageFolderAccess ? (
                        <p className="text-xs text-steel">
                          Разрешено папок: {user.allowedFolderIds?.length ?? 0}
                        </p>
                      ) : null}
                      {isProtectedDeveloper ? (
                        <p className="text-xs text-steel">
                          Управление пользователем с ролью «Разработчик» доступно только разработчику.
                        </p>
                      ) : null}
                    </div>
                    <svg
                      className={["mt-1 h-5 w-5 shrink-0 text-steel transition-transform", isExpanded ? "rotate-180" : ""].join(" ")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.9"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 9-7.5 7.5L4.5 9" />
                    </svg>
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4 border-t border-line px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="btn-secondary btn-sm"
                          to={currentUser?.id === user.id ? "/profile" : `/admin/users/${user.id}`}
                        >
                          Открыть карточку
                        </Link>
                        {assignableRoles.map((roleOption) => (
                          <button
                            key={roleOption}
                            className={[
                              "rounded-full border px-3 py-1.5 text-sm transition",
                              user.role === roleOption
                                ? "border-signal-info bg-[#eaf4f8] text-ink"
                                : "border-line bg-white text-steel hover:border-signal-info hover:text-ink",
                            ].join(" ")}
                            type="button"
                            disabled={roleActionDisabled}
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
                          disabled={accountActionDisabled}
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
                          disabled={isResettingPassword || isProtectedDeveloper}
                          onClick={() => handleResetPassword(user.id, user.fullName, user.email)}
                        >
                          {isResettingPassword ? "Сбрасываем..." : "Сбросить пароль"}
                        </button>
                        {canDeleteUserAccount ? (
                          <button
                            className="rounded-full border border-[#e7b8b2] bg-white px-3 py-1.5 text-sm text-[#b04c43] transition hover:border-[#b04c43] disabled:opacity-60"
                            type="button"
                            disabled={deleteUserMutation.isPending}
                            onClick={() => {
                              setDeleteMessage(null);
                              setDeleteUserId(user.id);
                            }}
                          >
                            {deleteUserMutation.isPending && isDeleteTarget
                              ? "Удаляем..."
                              : "Удалить"}
                          </button>
                        ) : null}
                      </div>

                      {canManageFolderAccess ? (
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-base font-semibold text-ink">Доступ к папкам</h3>
                            <p className="mt-1 max-w-[72ch] text-sm text-steel">
                              Отметь папки, которые пользователь может видеть в оборудовании, Аршине, настройках и на главной.
                            </p>
                          </div>

                          {foldersQuery.isLoading ? <p className="text-sm text-steel">Загружаем папки...</p> : null}
                          {foldersQuery.isError ? (
                            <p className="text-sm text-[#b04c43]">
                              {foldersQuery.error instanceof Error
                                ? foldersQuery.error.message
                                : "Не удалось загрузить список папок."}
                            </p>
                          ) : null}

                          {!foldersQuery.isLoading && !foldersQuery.isError ? (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {(foldersQuery.data ?? []).map((folder) => (
                                <label
                                  key={folder.id}
                                  className="tone-parent flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                                  htmlFor={`create-user-folder-${folder.id}`}
                                >
                                  <Switch
                                    checked={accessFolderIds.includes(folder.id)}
                                    className="mt-1"
                                    id={`create-user-folder-${folder.id}`}
                                    onCheckedChange={() => toggleAccessFolder(folder.id)}
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-semibold">{folder.name}</span>
                                    <span className="mt-1 block text-xs text-steel">
                                      {folder.description || "Рабочая папка без описания."}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : null}

                          {shouldWarnAboutDashboardFolders ? (
                            <p className="text-sm text-[#8c6a2b]">
                              После сохранения у пользователя будут сброшены папки информационной панели, которые не входят в разрешенный список.
                            </p>
                          ) : null}

                          {updateFolderAccessMutation.isError && expandedUserId === user.id ? (
                            <p className="text-sm text-[#b04c43]">
                              {updateFolderAccessMutation.error instanceof Error
                                ? updateFolderAccessMutation.error.message
                                : "Не удалось обновить доступ к папкам."}
                            </p>
                          ) : null}

                          {accessMessage && expandedUserId === user.id ? (
                            <p className="text-sm text-steel">{accessMessage}</p>
                          ) : null}

                          <div className="flex justify-end">
                            <button
                              className="btn-primary disabled:opacity-60"
                              disabled={
                                updateFolderAccessMutation.isPending
                                || foldersQuery.isLoading
                                || foldersQuery.isError
                                || !isAccessDirty
                              }
                              type="button"
                              onClick={() => void handleSaveFolderAccess()}
                            >
                              {updateFolderAccessMutation.isPending ? "Сохраняем..." : "Сохранить доступ"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
                })}
              </div>
            </>
          ) : null}
        </section>
      </div>

      <DeleteConfirmModal
        confirmLabel="Удалить пользователя"
        description={
          selectedDeleteUser
            ? `Будет удален пользователь ${selectedDeleteUser.fullName} (${selectedDeleteUser.email}). История действий и сообщения сохранятся без привязки к учетной записи.`
            : undefined
        }
        errorMessage={
          deleteUserMutation.isError && deleteUserMutation.error instanceof Error
            ? deleteUserMutation.error.message
            : null
        }
        isOpen={deleteUserId !== null}
        isPending={deleteUserMutation.isPending}
        pendingLabel="Удаляем..."
        title="Удалить пользователя?"
        onClose={() => {
          if (deleteUserMutation.isPending) {
            return;
          }
          setDeleteUserId(null);
        }}
        onConfirm={() => void handleDeleteUser()}
      />
    </section>
  );
}

function haveSameNumberSet(left: number[] | null | undefined, right: number[] | null | undefined): boolean {
  const normalizedLeft = Array.from(new Set(left ?? [])).sort((a, b) => a - b);
  const normalizedRight = Array.from(new Set(right ?? [])).sort((a, b) => a - b);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
