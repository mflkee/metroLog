import { oidcErrorMessage, parseOidcFragment } from "@/lib/oidc";

describe("parseOidcFragment", () => {
  it("reads the token and redirect from the fragment", () => {
    const result = parseOidcFragment("#token=abc.def&redirect=%2Fequipment");

    expect(result.token).toBe("abc.def");
    expect(result.redirect).toBe("/equipment");
    expect(result.error).toBeNull();
  });

  it("reads an error code", () => {
    const result = parseOidcFragment("#oidc_error=no_access");

    expect(result.error).toBe("no_access");
    expect(result.token).toBeNull();
  });

  it("rejects an external redirect target", () => {
    expect(parseOidcFragment("#token=x&redirect=https%3A%2F%2Fevil.example").redirect).toBeNull();
    expect(parseOidcFragment("#token=x&redirect=%2F%2Fevil.example").redirect).toBeNull();
  });

  it("tolerates an empty fragment", () => {
    expect(parseOidcFragment("")).toEqual({ token: null, redirect: null, error: null });
  });
});

describe("oidcErrorMessage", () => {
  it("maps known codes to a message", () => {
    expect(oidcErrorMessage("no_access")).toContain("нет доступа");
    expect(oidcErrorMessage("unknown_user")).toContain("не найдена");
  });

  it("falls back for unknown codes and is empty for no code", () => {
    expect(oidcErrorMessage("whatever")).toBeTruthy();
    expect(oidcErrorMessage(null)).toBeNull();
    expect(oidcErrorMessage(undefined)).toBeNull();
  });
});
