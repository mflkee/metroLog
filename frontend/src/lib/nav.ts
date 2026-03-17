import type { UserRole } from "@/api/auth";

export type NavigationItem = {
  icon: string;
  label: string;
  description: string;
  to: string;
};

const baseNavigationItems: NavigationItem[] = [
  { icon: "󰋜", label: "Главная", description: "Оперативный обзор", to: "/dashboard" },
  { icon: "󰉋", label: "Оборудование", description: "Папки, группы, реестр", to: "/equipment" },
  {
    icon: "󰭹",
    label: "Поверка СИ",
    description: "Синхронизация и ручная проверка",
    to: "/verification/si",
  },
  { icon: "󰛔", label: "Ремонты", description: "Активные и архивные", to: "/repairs" },
  { icon: "󰒓", label: "Настройки", description: "Справочники и система", to: "/settings" },
];

const eventsNavigationItem: NavigationItem = {
  icon: "󰋚",
  label: "Журнал",
  description: "История изменений",
  to: "/events",
};

const adminUsersNavigationItem: NavigationItem = {
  icon: "󰀄",
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
