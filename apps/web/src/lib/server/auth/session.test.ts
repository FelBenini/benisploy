import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../usecase/test-utils";
import {
  generateSecureRandomString,
  generateSessionToken,
  parseSessionToken,
  hashSecret,
  constantTimeEqual,
  createSession,
  validateSessionToken,
  deleteSession,
  verifyRequestOrigin,
  SESSION_EXPIRES_IN_SECONDS,
} from "./session";

describe("generateSecureRandomString", () => {
  it("returns a string of the expected length", () => {
    const result = generateSecureRandomString();
    expect(result).toHaveLength(24);
  });

  it("only uses characters from the allowed alphabet", () => {
    const result = generateSecureRandomString();
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    for (const ch of result) {
      expect(alphabet).toContain(ch);
    }
  });

  it("produces different values on successive calls", () => {
    const a = generateSecureRandomString();
    const b = generateSecureRandomString();
    expect(a).not.toBe(b);
  });
});

describe("generateSessionToken", () => {
  it("returns a token with id.secret format", () => {
    const token = generateSessionToken();
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(24);
    expect(parts[1]).toHaveLength(24);
  });
});

describe("parseSessionToken", () => {
  it("parses a valid token", () => {
    const result = parseSessionToken("abc123.def456");
    expect(result).toEqual({ sessionId: "abc123", secret: "def456" });
  });

  it("returns null for token without dot", () => {
    expect(parseSessionToken("abc123")).toBeNull();
  });

  it("returns null for token with too many dots", () => {
    expect(parseSessionToken("a.b.c")).toBeNull();
  });

  it("returns null for token with empty parts", () => {
    expect(parseSessionToken(".def456")).toBeNull();
    expect(parseSessionToken("abc123.")).toBeNull();
  });

  it("returns null for empty token", () => {
    expect(parseSessionToken("")).toBeNull();
  });
});

describe("hashSecret", () => {
  it("returns a 32-byte Uint8Array (SHA-256)", async () => {
    const hash = await hashSecret("test-secret");
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.byteLength).toBe(32);
  });

  it("produces consistent hashes for the same input", async () => {
    const a = await hashSecret("hello");
    const b = await hashSecret("hello");
    expect(a).toEqual(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashSecret("hello");
    const b = await hashSecret("world");
    expect(a).not.toEqual(b);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it("returns false for different arrays", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("returns false for arrays of different lengths", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });
});

describe("createSession", () => {
  it("creates a session and returns a token", async () => {
    const repo = new InMemoryRepository();
    const result = await createSession(repo.sessions, "user-1");

    expect(result.id).toHaveLength(24);
    expect(result.userId).toBe("user-1");
    expect(result.token).toContain(".");
    expect(result.token).toContain(result.id);
    expect(result.secretHash).toBeInstanceOf(Uint8Array);
    expect(result.secretHash.byteLength).toBe(32);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.expiresAt).toBeInstanceOf(Date);

    const expectedExpiry =
      result.createdAt.getTime() + SESSION_EXPIRES_IN_SECONDS * 1000;
    expect(result.expiresAt.getTime()).toBe(expectedExpiry);
  });

  it("persists the session in the repository", async () => {
    const repo = new InMemoryRepository();
    const result = await createSession(repo.sessions, "user-1");

    const stored = await repo.sessions.get(result.id);
    expect(stored).not.toBeNull();
    expect(stored!.id).toBe(result.id);
    expect(stored!.userId).toBe("user-1");
    expect(stored!.secretHash).toEqual(result.secretHash);
  });
});

describe("validateSessionToken", () => {
  it("returns the session for a valid token", async () => {
    const repo = new InMemoryRepository();
    const created = await createSession(repo.sessions, "user-1");

    const session = await validateSessionToken(repo.sessions, created.token);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(created.id);
    expect(session!.userId).toBe("user-1");
  });

  it("returns null for a malformed token", async () => {
    const repo = new InMemoryRepository();
    expect(await validateSessionToken(repo.sessions, "invalid")).toBeNull();
  });

  it("returns null for a non-existent session ID", async () => {
    const repo = new InMemoryRepository();
    const token = "nonexistent123456789.secret123456789";
    expect(await validateSessionToken(repo.sessions, token)).toBeNull();
  });

  it("returns null when the secret does not match", async () => {
    const repo = new InMemoryRepository();
    const result = await createSession(repo.sessions, "user-1");
    const wrongToken = `${result.id}.wrong-secret`;

    expect(await validateSessionToken(repo.sessions, wrongToken)).toBeNull();
  });

  it("deletes expired sessions and returns null", async () => {
    const repo = new InMemoryRepository();
    const result = await createSession(repo.sessions, "user-1");

    // Manually expire the session
    const expired = await repo.sessions.get(result.id);
    await repo.sessions.create({
      ...expired!,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await validateSessionToken(repo.sessions, result.token)).toBeNull();
    expect(await repo.sessions.get(result.id)).toBeNull();
  });
});

describe("deleteSession", () => {
  it("removes the session from the repository", async () => {
    const repo = new InMemoryRepository();
    const result = await createSession(repo.sessions, "user-1");

    await deleteSession(repo.sessions, result.id);
    expect(await repo.sessions.get(result.id)).toBeNull();
  });
});

describe("verifyRequestOrigin", () => {
  it("returns true when origin matches host", () => {
    expect(verifyRequestOrigin("https://example.com", "example.com")).toBe(
      true,
    );
  });

  it("returns true with port in origin", () => {
    expect(verifyRequestOrigin("http://localhost:5173", "localhost:5173")).toBe(
      true,
    );
  });

  it("returns false when origin does not match host", () => {
    expect(verifyRequestOrigin("https://attacker.com", "example.com")).toBe(
      false,
    );
  });

  it("returns false when origin is null", () => {
    expect(verifyRequestOrigin(null, "example.com")).toBe(false);
  });

  it("returns false when host is null", () => {
    expect(verifyRequestOrigin("https://example.com", null)).toBe(false);
  });

  it("returns false for invalid origin URL", () => {
    expect(verifyRequestOrigin("not-a-url", "example.com")).toBe(false);
  });
});
