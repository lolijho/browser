import { describe, expect, it } from "vitest";
import { EnvValidationError, apiEnvSchema, parseEnv, workerEnvSchema } from "./env.js";

describe("parseEnv(apiEnvSchema)", () => {
  it("applica i default con ambiente vuoto", () => {
    const env = parseEnv(apiEnvSchema, {});
    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(3000);
    expect(env.API_HOST).toBe("127.0.0.1");
  });

  it("consente il bind esplicito su tutte le interfacce", () => {
    const env = parseEnv(apiEnvSchema, { API_HOST: "0.0.0.0" });
    expect(env.API_HOST).toBe("0.0.0.0");
  });

  it("converte API_PORT da stringa a numero", () => {
    const env = parseEnv(apiEnvSchema, { API_PORT: "8080" });
    expect(env.API_PORT).toBe(8080);
  });

  it("rifiuta porte fuori range con errore esplicito", () => {
    expect(() => parseEnv(apiEnvSchema, { API_PORT: "99999" })).toThrow(EnvValidationError);
  });
});

describe("parseEnv(workerEnvSchema)", () => {
  it("consente REDIS_URL assente in fase bootstrap", () => {
    const env = parseEnv(workerEnvSchema, {});
    expect(env.REDIS_URL).toBeUndefined();
  });

  it("rifiuta REDIS_URL malformata", () => {
    expect(() => parseEnv(workerEnvSchema, { REDIS_URL: "non-un-url" })).toThrow(
      EnvValidationError,
    );
  });
});
