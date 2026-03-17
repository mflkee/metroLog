import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { UserRole } from "@/api/auth";
import { fetchUsers, updateUserRole } from "@/api/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

const roleOrder: UserRole[] = ["ADMINISTRATOR", "MKAIR", "CUSTOMER"];

export function AdminUsersPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) =>
      updateUserRole(token ?? "", userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  if (!token) {
    return null;
  }

  return (
    <section>
      <PageHeader
        title="Пользователи"
        description="Администратор управляет учетными записями и назначает роли доступа."
      />

      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
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

        {updateRoleMutation.isError ? (
          <p className="mb-4 text-sm text-[#b04c43]">
            {updateRoleMutation.error instanceof Error
              ? updateRoleMutation.error.message
              : "Не удалось изменить роль."}
          </p>
        ) : null}

        {usersQuery.data ? (
          <div className="space-y-4">
            {usersQuery.data.map((user) => {
              const isUpdatingUser =
                updateRoleMutation.isPending && updateRoleMutation.variables?.userId === user.id;

              return (
                <article
                  key={user.id}
                  className="rounded-2xl border border-line bg-white/85 p-4 shadow-panel"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink">{user.displayName}</h3>
                        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-steel">
                          {roleLabels[user.role]}
                        </span>
                        {currentUser?.id === user.id ? (
                          <span className="rounded-full bg-[#eaf4f8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal-info">
                            Вы
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-steel">{user.email}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {roleOrder.map((role) => (
                        <button
                          key={role}
                          className={[
                            "rounded-full border px-3 py-1.5 text-sm transition",
                            user.role === role
                              ? "border-signal-info bg-[#eaf4f8] text-ink"
                              : "border-line bg-white text-steel hover:border-signal-info hover:text-ink",
                          ].join(" ")}
                          type="button"
                          disabled={isUpdatingUser}
                          onClick={() => updateRoleMutation.mutate({ userId: user.id, role })}
                        >
                          {isUpdatingUser && updateRoleMutation.variables?.role === role
                            ? "Сохраняем..."
                            : roleLabels[role]}
                        </button>
                      ))}
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
