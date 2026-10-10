import type { UserRole } from "@/api/auth";
import { matchesSearchQuery } from "@/lib/search";
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

/**
 * A user matches when every term of the query appears somewhere in the record — the shared
 * term-based rule in `lib/search.ts` — with the role and the state widened to the words a person
 * would actually type («админ», «активен»).
 */
export function matchesUserSearch(user: SearchableUserLike, query: string): boolean {
  const stateTerms =
    user.isActive === true
      ? "активен active enabled"
      : user.isActive === false
        ? "отключен неактивен inactive disabled"
        : null;

  return matchesSearchQuery(
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
      user.role ?? null,
      user.role ? roleLabels[user.role] : null,
      user.role ? roleSearchAliases[user.role].join(" ") : null,
      stateTerms,
    ],
    query,
  );
}

export function buildUserExtraInfo(user: Pick<SearchableUserLike, "organization" | "position" | "facility">): string | null {
  const value = [user.organization, user.position, user.facility]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" · ");
  return value || null;
}
