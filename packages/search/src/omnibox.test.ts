import { describe, expect, it } from "vitest";
import { classifyOmniboxInput } from "./omnibox.js";

describe("classifyOmniboxInput", () => {
  it("riconosce URL http/https completi", () => {
    expect(classifyOmniboxInput("https://example.com/a?b=1")).toEqual({
      kind: "url",
      url: "https://example.com/a?b=1",
    });
    expect(classifyOmniboxInput("http://example.com")).toMatchObject({ kind: "url" });
  });

  it("riconosce domini senza schema e aggiunge https", () => {
    expect(classifyOmniboxInput("github.com")).toEqual({ kind: "url", url: "https://github.com/" });
    expect(classifyOmniboxInput("amazon.it/deals")).toMatchObject({ kind: "url" });
    expect(classifyOmniboxInput("example.com:8443")).toMatchObject({ kind: "url" });
  });

  it("riconosce localhost e IP", () => {
    expect(classifyOmniboxInput("localhost:3000/health")).toEqual({
      kind: "url",
      url: "http://localhost:3000/health",
    });
    expect(classifyOmniboxInput("192.168.1.10:8080")).toMatchObject({ kind: "url" });
  });

  it("tratta il testo con spazi come ricerca", () => {
    expect(classifyOmniboxInput("crm per pmi")).toEqual({ kind: "search", query: "crm per pmi" });
  });

  it("tratta parole singole senza punto come ricerca", () => {
    expect(classifyOmniboxInput("fatturazione")).toEqual({
      kind: "search",
      query: "fatturazione",
    });
  });

  it("NON tratta come URL gli schemi pericolosi", () => {
    for (const input of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x"]) {
      expect(classifyOmniboxInput(input).kind).toBe("search");
    }
  });

  it("lascia passare le route interne businessbox://", () => {
    expect(classifyOmniboxInput("businessbox://newtab")).toEqual({
      kind: "url",
      url: "businessbox://newtab",
    });
  });
});
