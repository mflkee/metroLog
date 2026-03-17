import type { UserRole } from "@/api/auth";

export type NavigationItem = {
  label: string;
  description: string;
  to: string;
};

const baseNavigationItems: NavigationItem[] = [
  { label: "Главная", description: "Оперативный обзор", to: "/dashboard" },
  { label: "Оборудование", description: "Папки, группы, реестр", to: "/equipment" },
  { label: "Карточки", description: "Детальный просмотр", to: "/equipment-cards" },
  { label: "Поверка СИ", description: "Синхронизация и ручная проверка", to: "/verification/si" },
  { label: "Ремонты", description: "Активные и архивные", to: "/repairs" },
  { label: "Настройки", description: "Справочники и система", to: "/settings" },
];

const eventsNavigationItem: NavigationItem = {
  label: "Журнал",
  description: "История изменений",
  to: "/events",
};

const adminUsersNavigationItem: NavigationItem = {
  label: "Пользователи",
  description: "Роли и права доступа",
  to: "/admin/users",
};

export function getNavigationItems(role: UserRole | null | undefined): NavigationItem[] {
  const items = [...baseNavigationItems];

  if (role === "ADMINISTRATOR" || role === "MKAIR") {
    items.splice(5, 0, eventsNavigationItem);
  }

  if (role === "ADMINISTRATOR") {
    items.push(adminUsersNavigationItem);
  }

  return items;
}
