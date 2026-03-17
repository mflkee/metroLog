import { Link, Navigate, useParams } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";

import { fetchUserById } from "@/api/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

export function UserDetailsPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const { userId } = useParams<{ userId: string }>();
  const parsedUserId = Number(userId);

  const userQuery = useQuery({
    queryKey: ["admin-user", parsedUserId],
    queryFn: () => fetchUserById(token ?? "", parsedUserId),
    enabled: Boolean(token) && Number.isInteger(parsedUserId) && parsedUserId > 0,
  });

  if (currentUser?.id === parsedUserId) {
    return <Navigate to="/profile" replace />;
  }

  return (
    <section>
      <PageHeader
        title="Профиль пользователя"
        description="Просмотр контактной и рабочей информации по учетной записи."
      />

      <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link
            className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info"
            to="/admin/users"
          >
            Назад к пользователям
          </Link>
        </div>

        {userQuery.isLoading ? (
          <p className="text-sm text-steel">Загружаем профиль пользователя...</p>
        ) : null}

        {userQuery.isError ? (
          <p className="text-sm text-[#b04c43]">
            {userQuery.error instanceof Error
              ? userQuery.error.message
              : "Не удалось загрузить профиль пользователя."}
          </p>
        ) : null}

        {userQuery.data ? (
          <dl className="overflow-hidden rounded-2xl border border-line bg-white/85">
            {[
              ["Пользователь", userQuery.data.displayName],
              ["Email", userQuery.data.email],
              ["Роль", roleLabels[userQuery.data.role]],
              ["Статус", userQuery.data.isActive ? "Активен" : "Отключен"],
              ["Требуется смена пароля", userQuery.data.mustChangePassword ? "Да" : "Нет"],
              ["Телефон", userQuery.data.phone || "Не указан"],
              ["Организация", userQuery.data.organization || "Не указана"],
              ["Должность", userQuery.data.position || "Не указана"],
              ["Объект", userQuery.data.facility || "Не указан"],
            ].map(([label, value], index) => (
              <div
                key={label}
                className={[
                  "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-4",
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
        ) : null}
      </div>
    </section>
  );
}
