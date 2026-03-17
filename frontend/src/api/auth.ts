import { apiRequest } from "@/api/client";

export type UserRole = "ADMINISTRATOR" | "MKAIR" | "CUSTOMER";

type RawUser = {
  id: number;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  phone: string | null;
  position: string | null;
  facility: string | null;
  created_at: string;
  updated_at: string;
};

type RawAuthResponse = {
  access_token: string;
  token_type: string;
  user: RawUser;
};

export type AuthUser = {
  id: number;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  phone: string | null;
  position: string | null;
  facility: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
};

export type AuthActionResponse = {
  status: string;
  message: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type UpdateProfilePayload = {
  phone: string;
  position: string;
  facility: string;
};

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiRequest<RawAuthResponse>("/auth/login", {
    method: "POST",
    body: {
      email: payload.email,
      password: payload.password,
    },
  });
  return mapAuthResponse(response);
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await apiRequest<RawUser>("/auth/me", {
    method: "GET",
    token,
  });
  return mapUser(response);
}

export async function changePassword(
  token: string,
  payload: ChangePasswordPayload,
): Promise<AuthActionResponse> {
  return apiRequest<AuthActionResponse>("/auth/change-password", {
    method: "POST",
    token,
    body: {
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
      confirm_new_password: payload.confirmNewPassword,
    },
  });
}

export async function updateProfile(
  token: string,
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  const response = await apiRequest<RawUser>("/auth/me", {
    method: "PATCH",
    token,
    body: {
      phone: payload.phone,
      position: payload.position,
      facility: payload.facility,
    },
  });
  return mapUser(response);
}

function mapAuthResponse(response: RawAuthResponse): AuthResponse {
  return {
    accessToken: response.access_token,
    tokenType: response.token_type,
    user: mapUser(response.user),
  };
}

export function mapUser(user: RawUser): AuthUser {
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    mustChangePassword: user.must_change_password,
    passwordChangedAt: user.password_changed_at,
    phone: user.phone,
    position: user.position,
    facility: user.facility,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
