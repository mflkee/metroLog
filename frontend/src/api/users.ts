import { apiRequest } from "@/api/client";
import { mapUser, type AuthUser, type UserRole } from "@/api/auth";

type RawUser = {
  id: number;
  display_name: string;
  email: string;
  role: UserRole;
  email_verified_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchUsers(token: string): Promise<AuthUser[]> {
  const response = await apiRequest<RawUser[]>("/users", {
    method: "GET",
    token,
  });
  return response.map(mapUser);
}

export async function updateUserRole(
  token: string,
  userId: number,
  role: UserRole,
): Promise<AuthUser> {
  const response = await apiRequest<RawUser>(`/users/${userId}/role`, {
    method: "PATCH",
    token,
    body: { role },
  });
  return mapUser(response);
}
