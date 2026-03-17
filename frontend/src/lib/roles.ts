import type { UserRole } from "@/api/auth";

export const roleLabels: Record<UserRole, string> = {
  ADMINISTRATOR: "Администратор",
  MKAIR: "МКАИР",
  CUSTOMER: "Заказчик",
};
