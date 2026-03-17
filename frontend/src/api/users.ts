import { apiRequest } from "@/api/client";
import { mapUser, type AuthUser, type UserRole } from "@/api/auth";

type RawUser = {
  id: number;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  phone: string | null;
  organization: string | null;
  position: string | null;
  facility: string | null;
  created_at: string;
  updated_at: string;
};

type RawUserTemporaryPasswordResponse = {
  user: RawUser;
  temporary_password: string;
};

export type CreateUserPayload = {
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type UpdateUserPayload = {
  displayName?: string;
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
      display_name: payload.displayName,
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
      display_name: payload.displayName,
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
