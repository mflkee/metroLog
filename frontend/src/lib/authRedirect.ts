type AuthRedirectState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
  message?: string;
};

export function buildLoginRedirectState(
  path: { pathname: string; search?: string; hash?: string },
  message?: string,
): AuthRedirectState {
  return {
    from: {
      pathname: path.pathname,
      search: path.search ?? "",
      hash: path.hash ?? "",
    },
    message,
  };
}

export function getLoginStateMessage(state: unknown): string | null {
  if (
    typeof state === "object" &&
    state !== null &&
    "message" in state &&
    typeof state.message === "string" &&
    state.message.trim()
  ) {
    return state.message;
  }

  return null;
}

export function resolvePostLoginRedirect(
  state: unknown,
  fallbackPath: string,
): string {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return fallbackPath;
  }

  const from = state.from;
  if (typeof from !== "object" || from === null) {
    return fallbackPath;
  }

  const pathname =
    "pathname" in from && typeof from.pathname === "string"
      ? from.pathname.trim()
      : "";
  const search =
    "search" in from && typeof from.search === "string"
      ? from.search
      : "";
  const hash =
    "hash" in from && typeof from.hash === "string"
      ? from.hash
      : "";

  if (!pathname || !pathname.startsWith("/") || pathname === "/login") {
    return fallbackPath;
  }

  return `${pathname}${search}${hash}`;
}
