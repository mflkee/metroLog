import type { UserRole } from "@/api/auth";
import { roleLabels } from "@/lib/roles";

type SearchableUserLike = {
  fullName?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  email?: string | null;
  role?: UserRole | null;
  organization?: string | null;
  position?: string | null;
  facility?: string | null;
  phone?: string | null;
  isActive?: boolean | null;
};

const roleSearchAliases: Record<UserRole, string[]> = {
  DEVELOPER: ["разработчик", "developer", "dev"],
  ADMINISTRATOR: ["админ", "admin", "administrator"],
  MKAIR: ["mkair"],
  CUSTOMER: ["customer", "client"],
};

export const userSearchPlaceholder = "Имя, email, роль, организация";

export function matchesUserSearch(user: SearchableUserLike, query: string): boolean {
  const normalizedTerms = normalizeSearchText(query)
    .split(" ")
    .filter(Boolean);
  if (!normalizedTerms.length) {
    return true;
  }

  const roleTerms = user.role
    ? [user.role, roleLabels[user.role], ...roleSearchAliases[user.role]]
    : [];
  const stateTerms =
    user.isActive === true
      ? ["активен", "active", "enabled"]
      : user.isActive === false
        ? ["отключен", "неактивен", "inactive", "disabled"]
        : [];
  const searchableText = normalizeSearchText(
    [
      user.fullName,
      user.displayName,
      user.firstName,
      user.lastName,
      user.patronymic,
      user.email,
      user.organization,
      user.position,
      user.facility,
      user.phone,
      ...roleTerms,
      ...stateTerms,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" "),
  );

  return normalizedTerms.every((term) => searchableText.includes(term));
}

export function buildUserExtraInfo(user: Pick<SearchableUserLike, "organization" | "position" | "facility">): string | null {
  const value = [user.organization, user.position, user.facility]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" · ");
  return value || null;
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}
