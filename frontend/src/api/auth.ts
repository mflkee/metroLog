import { apiRequest } from "@/api/client";

export type UserRole = "ADMINISTRATOR" | "MKAIR" | "CUSTOMER";

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
  emailVerifiedAt: string | null;
  isActive: boolean;
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

export type RegisterPayload = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type VerifyEmailPayload = {
  email: string;
  code: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  email: string;
  code: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
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

export async function registerUser(payload: RegisterPayload): Promise<AuthActionResponse> {
  return apiRequest<AuthActionResponse>("/auth/register", {
    method: "POST",
    body: {
      display_name: payload.displayName,
      email: payload.email,
      password: payload.password,
      confirm_password: payload.confirmPassword,
    },
  });
}

export async function verifyEmail(payload: VerifyEmailPayload): Promise<AuthResponse> {
  const response = await apiRequest<RawAuthResponse>("/auth/verify-email", {
    method: "POST",
    body: {
      email: payload.email,
      code: payload.code,
    },
  });
  return mapAuthResponse(response);
}

export async function resendVerification(email: string): Promise<AuthActionResponse> {
  return apiRequest<AuthActionResponse>("/auth/resend-verification", {
    method: "POST",
    body: { email },
  });
}

export async function requestPasswordReset(
  payload: ForgotPasswordPayload,
): Promise<AuthActionResponse> {
  return apiRequest<AuthActionResponse>("/auth/forgot-password", {
    method: "POST",
    body: { email: payload.email },
  });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<AuthActionResponse> {
  return apiRequest<AuthActionResponse>("/auth/reset-password", {
    method: "POST",
    body: {
      email: payload.email,
      code: payload.code,
      new_password: payload.newPassword,
      confirm_new_password: payload.confirmNewPassword,
    },
  });
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
    emailVerifiedAt: user.email_verified_at,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
