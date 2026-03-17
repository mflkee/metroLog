import type { UserRole } from "@/api/auth";
import { hasAdminAccess } from "@/lib/roles";

export type NavigationItem = {
  icon: string;
  label: string;
  description: string;
  to: string;
};

const baseNavigationItems: NavigationItem[] = [
  { icon: "home", label: "Главная", description: "Информационная панель по папке и срокам", to: "/dashboard" },
  { icon: "equipment", label: "Оборудование", description: "Папки, реестр и массовые действия", to: "/equipment" },
  { icon: "arshin", label: "Аршин", description: "Поиск СИ и перенос в папки", to: "/arshin" },
  {
    icon: "verification",
    label: "Поверка СИ",
    description: "Очередь, группы и архив",
    to: "/verification/si",
  },
  { icon: "repairs", label: "Ремонты", description: "Очередь, этапы и архив", to: "/repairs" },
  { icon: "settings", label: "Настройки", description: "Профиль, темы и параметры", to: "/settings" },
];

const eventsNavigationItem: NavigationItem = {
  icon: "events",
  label: "Журнал",
  description: "События, фильтры и экспорт",
  to: "/events",
};

const developerNavigationItem: NavigationItem = {
  icon: "monitor",
  label: "Мониторинг",
  description: "Состояние, активность и статистика",
  to: "/developer",
};

const adminUsersNavigationItem: NavigationItem = {
  icon: "users",
  label: "Пользователи",
  description: "Роли, доступы и папки",
  to: "/admin/users",
};

export function getNavigationItems(role: UserRole | null | undefined): NavigationItem[] {
  const items = [...baseNavigationItems];

  if (role) {
    items.splice(5, 0, eventsNavigationItem);
  }

  if (hasAdminAccess(role)) {
    items.push(developerNavigationItem, adminUsersNavigationItem);
  }

  return items;
}
