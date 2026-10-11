import { afterEach, describe, expect, it } from "vitest";
import { cookieSecure } from "./auth.controller";

/**
 * The Secure flag follows the address people use, not NODE_ENV: a production
 * image on a plain-HTTP LAN address must still be able to sign in (docs/13).
 */
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("cookieSecure", () => {
  it("is on behind https", () => {
    process.env.WEB_ORIGIN = "https://hiring.example.com";
    process.env.NODE_ENV = "development";
    expect(cookieSecure()).toBe(true);
  });

  it("is off on plain http, even in production", () => {
    process.env.WEB_ORIGIN = "http://192.168.1.20:3000";
    process.env.NODE_ENV = "production";
    expect(cookieSecure()).toBe(false);
  });

  it("falls back to NODE_ENV when no origin is set", () => {
    delete process.env.WEB_ORIGIN;
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = "production";
    expect(cookieSecure()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(cookieSecure()).toBe(false);
  });

  it("obeys an explicit override either way", () => {
    process.env.WEB_ORIGIN = "https://hiring.example.com";
    process.env.COOKIE_SECURE = "false";
    expect(cookieSecure()).toBe(false);
    process.env.WEB_ORIGIN = "http://localhost:3000";
    process.env.COOKIE_SECURE = "true";
    expect(cookieSecure()).toBe(true);
  });
});
