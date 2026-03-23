import type { UserRole } from "@/api/auth";

export type NavigationItem = {
  icon: string;
  label: string;
  description: string;
  to: string;
};

const baseNavigationItems: NavigationItem[] = [
  { icon: "home", label: "Главная", description: "Оперативный обзор", to: "/dashboard" },
  { icon: "equipment", label: "Оборудование", description: "Папки, группы, реестр", to: "/equipment" },
  {
    icon: "verification",
    label: "Поверка СИ",
    description: "Синхронизация и ручная проверка",
    to: "/verification/si",
  },
  { icon: "repairs", label: "Ремонты", description: "Активные и архивные", to: "/repairs" },
  { icon: "settings", label: "Настройки", description: "Справочники и система", to: "/settings" },
];

const eventsNavigationItem: NavigationItem = {
  icon: "events",
  label: "Журнал",
  description: "История изменений",
  to: "/events",
};

const developerNavigationItem: NavigationItem = {
  icon: "monitor",
  label: "Мониторинг",
  description: "Статистика, активность и состояние пользователей",
  to: "/developer",
};

const adminUsersNavigationItem: NavigationItem = {
  icon: "users",
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
    items.push(developerNavigationItem, adminUsersNavigationItem);
  }

  return items;
}
