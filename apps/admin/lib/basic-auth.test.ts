import { describe, expect, it } from "vitest";
import { evaluateAccess, isPublicPath, timingSafeEqual } from "./basic-auth";

/** Header Basic Auth per le credenziali date. */
function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

const USER = "admin";
const PASSWORD = "s3gr3t0-lungo";

describe("evaluateAccess", () => {
  it("credenziali corrette → allow", () => {
    expect(
      evaluateAccess({
        pathname: "/users",
        authorizationHeader: basic(USER, PASSWORD),
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("allow");
  });

  it("password errata → unauthorized", () => {
    expect(
      evaluateAccess({
        pathname: "/users",
        authorizationHeader: basic(USER, "sbagliata"),
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("unauthorized");
  });

  it("utente errato → unauthorized", () => {
    expect(
      evaluateAccess({
        pathname: "/users",
        authorizationHeader: basic("root", PASSWORD),
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("unauthorized");
  });

  it("nessun header → unauthorized", () => {
    expect(
      evaluateAccess({
        pathname: "/organizations",
        authorizationHeader: null,
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("unauthorized");
  });

  it("header non-Basic (es. Bearer) → unauthorized", () => {
    expect(
      evaluateAccess({
        pathname: "/organizations",
        authorizationHeader: "Bearer qualcosa",
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("unauthorized");
  });

  it("base64 malformato → unauthorized, non crash", () => {
    expect(
      evaluateAccess({
        pathname: "/audit",
        authorizationHeader: "Basic @@@non-base64@@@",
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("unauthorized");
  });

  it("FAIL-CLOSED: password non configurata → not-configured anche con credenziali", () => {
    expect(
      evaluateAccess({
        pathname: "/users",
        authorizationHeader: basic(USER, PASSWORD),
        expectedUser: USER,
        expectedPassword: "",
      }),
    ).toBe("not-configured");
  });

  it("il path di health è pubblico anche senza credenziali", () => {
    expect(
      evaluateAccess({
        pathname: "/api/health",
        authorizationHeader: null,
        expectedUser: USER,
        expectedPassword: PASSWORD,
      }),
    ).toBe("allow");
  });

  it("health resta pubblico anche se la password non è configurata", () => {
    // Il container deve poter fare l'healthcheck a prescindere.
    expect(
      evaluateAccess({
        pathname: "/api/health",
        authorizationHeader: null,
        expectedUser: USER,
        expectedPassword: "",
      }),
    ).toBe("allow");
  });
});

describe("isPublicPath", () => {
  it("solo /api/health (e sotto-path) è pubblico", () => {
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/api/health/live")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/users")).toBe(false);
    // Non deve bastare un prefisso ingannevole.
    expect(isPublicPath("/api/health-fake")).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("uguali → true, diversi → false, lunghezze diverse → false", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
