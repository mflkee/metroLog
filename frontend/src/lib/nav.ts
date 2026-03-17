export type NavigationItem = {
  label: string;
  description: string;
  to: string;
};

export const navigationItems: NavigationItem[] = [
  { label: "Главная", description: "Оперативный обзор", to: "/dashboard" },
  { label: "Оборудование", description: "Папки, группы, реестр", to: "/equipment" },
  { label: "Карточки", description: "Детальный просмотр", to: "/equipment-cards" },
  { label: "Поверка СИ", description: "Синхронизация и ручная проверка", to: "/verification/si" },
  { label: "Ремонты", description: "Активные и архивные", to: "/repairs" },
  { label: "Журнал", description: "История изменений", to: "/events" },
  { label: "Настройки", description: "Справочники и система", to: "/settings" },
];

