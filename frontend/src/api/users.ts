import { apiRequest } from "@/api/client";
import { mapUser, type AuthUser, type UserRole } from "@/api/auth";
import type { ThemeName } from "@/store/theme";

type RawUser = {
  id: number;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  phone: string | null;
  organization: string | null;
  position: string | null;
  facility: string | null;
  theme_preference: ThemeName | null;
  enabled_theme_options: ThemeName[] | null;
  created_at: string;
  updated_at: string;
};

type RawUserTemporaryPasswordResponse = {
  user: RawUser;
  temporary_password: string;
};

export type CreateUserPayload = {
  firstName: string;
  lastName: string;
  patronymic: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type UpdateUserPayload = {
  firstName?: string;
  lastName?: string;
  patronymic?: string;
  role?: UserRole;
  isActive?: boolean;
};

export type UserTemporaryPasswordResponse = {
  user: AuthUser;
  temporaryPassword: string;
};

export async function fetchUsers(token: string): Promise<AuthUser[]> {
  const response = await apiRequest<RawUser[]>("/users", {
    method: "GET",
    token,
  });
  return response.map(mapUser);
}

export async function fetchUserById(token: string, userId: number): Promise<AuthUser> {
  const response = await apiRequest<RawUser>(`/users/${userId}`, {
    method: "GET",
    token,
  });
  return mapUser(response);
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

export async function createUser(
  token: string,
  payload: CreateUserPayload,
): Promise<UserTemporaryPasswordResponse> {
  const response = await apiRequest<RawUserTemporaryPasswordResponse>("/users", {
    method: "POST",
    token,
    body: {
      first_name: payload.firstName,
      last_name: payload.lastName,
      patronymic: payload.patronymic,
      email: payload.email,
      role: payload.role,
      is_active: payload.isActive,
    },
  });
  return {
    user: mapUser(response.user),
    temporaryPassword: response.temporary_password,
  };
}

export async function updateUser(
  token: string,
  userId: number,
  payload: UpdateUserPayload,
): Promise<AuthUser> {
  const response = await apiRequest<RawUser>(`/users/${userId}`, {
    method: "PATCH",
    token,
    body: {
      first_name: payload.firstName,
      last_name: payload.lastName,
      patronymic: payload.patronymic,
      role: payload.role,
      is_active: payload.isActive,
    },
  });
  return mapUser(response);
}

export async function resetUserPassword(
  token: string,
  userId: number,
): Promise<UserTemporaryPasswordResponse> {
  const response = await apiRequest<RawUserTemporaryPasswordResponse>(
    `/users/${userId}/reset-password`,
    {
      method: "POST",
      token,
    },
  );
  return {
    user: mapUser(response.user),
    temporaryPassword: response.temporary_password,
  };
}
