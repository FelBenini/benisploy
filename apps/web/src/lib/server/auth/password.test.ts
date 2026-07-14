import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("returns an argon2 encoded hash string", async () => {
    const result = await hashPassword("my-password");
    expect(result).toContain("$argon2");
  });

  it("produces different hashes for the same password (different salt)", async () => {
    const a = await hashPassword("password");
    const b = await hashPassword("password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns true for matching password", async () => {
    const hash = await hashPassword("my-password");
    expect(await verifyPassword("my-password", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("my-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("returns false for malformed hash", async () => {
    expect(await verifyPassword("password", "invalid-hash")).toBe(false);
  });

  it("returns false for empty hash", async () => {
    expect(await verifyPassword("password", "")).toBe(false);
  });
});
