import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { hashPassword } from "$lib/server/auth/password";
import type { RequestEvent } from "./login/$types";

let testPasswordHash: string;
let mockGetPasswordHashByEmail: ReturnType<typeof vi.fn>;
let mockVerifyPassword: ReturnType<typeof vi.fn>;
let mockCreateSession: ReturnType<typeof vi.fn>;
let mockIpConsume: ReturnType<typeof vi.fn>;
let mockAccountConsume: ReturnType<typeof vi.fn>;
let mockAccountReset: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockGetPasswordHashByEmail = vi.fn();
  mockVerifyPassword = vi.fn();
  mockCreateSession = vi.fn();
  mockIpConsume = vi.fn();
  mockAccountConsume = vi.fn();
  mockAccountReset = vi.fn();
  return {
    app: {
      db: {},
      repo: { users: { getPasswordHashByEmail: mockGetPasswordHashByEmail } },
      auth: {
        createSession: mockCreateSession,
        verifyPassword: mockVerifyPassword,
      },
      rateLimiters: {
        loginByIp: { consume: mockIpConsume },
        loginByAccount: {
          consume: mockAccountConsume,
          reset: mockAccountReset,
        },
      },
    },
  };
});

const { POST } = await import("./login/+server");

function createRequestEvent(
  body: unknown,
  clientAddress = "203.0.113.1",
): RequestEvent {
  return {
    request: new Request("http://localhost:5173/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        Host: "localhost:5173",
      },
      body: JSON.stringify(body),
    }),
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    getClientAddress: () => clientAddress,
    locals: {},
  } as unknown as RequestEvent;
}

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    testPasswordHash = await hashPassword("test-password");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nobody is rate limited.
    mockIpConsume.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mockAccountConsume.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("returns 200 with user data for valid credentials", async () => {
    mockGetPasswordHashByEmail.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        createdAt: new Date().toISOString(),
      },
      passwordHash: testPasswordHash,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue({ token: "session-id.secret" });

    const event = createRequestEvent({
      email: "test@example.com",
      password: "test-password",
    });
    const response = await POST(event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      user: { id: "user-1", email: "test@example.com" },
    });
  });

  it("returns 401 for invalid email", async () => {
    mockGetPasswordHashByEmail.mockResolvedValue(null);
    const event = createRequestEvent({
      email: "unknown@example.com",
      password: "test-password",
    });
    const response = await POST(event);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Invalid email or password");
  });

  it("returns 401 for wrong password", async () => {
    mockGetPasswordHashByEmail.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        createdAt: new Date().toISOString(),
      },
      passwordHash: testPasswordHash,
    });
    mockVerifyPassword.mockResolvedValue(false);

    const event = createRequestEvent({
      email: "test@example.com",
      password: "wrong-password",
    });
    const response = await POST(event);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Invalid email or password");
  });

  it("returns 400 for invalid email format", async () => {
    const event = createRequestEvent({
      email: "not-an-email",
      password: "test-password",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing password", async () => {
    const event = createRequestEvent({ email: "test@example.com" });
    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-JSON body", async () => {
    const event = {
      request: new Request("http://localhost:5173/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "http://localhost:5173",
          Host: "localhost:5173",
        },
        body: "not-json",
      }),
      cookies: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        serialize: vi.fn(),
      },
      getClientAddress: () => "203.0.113.1",
      locals: {},
    } as unknown as RequestEvent;

    const response = await POST(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  describe("rate limiting", () => {
    it("returns 429 when the per-IP limit is exceeded, without touching the DB", async () => {
      mockIpConsume.mockResolvedValue({ allowed: false, retryAfterMs: 42_000 });

      const event = createRequestEvent({
        email: "test@example.com",
        password: "test-password",
      });
      const response = await POST(event);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("42");
      expect(mockGetPasswordHashByEmail).not.toHaveBeenCalled();
      expect(mockVerifyPassword).not.toHaveBeenCalled();
    });

    it("returns 429 when the per-account limit is exceeded, without touching the DB", async () => {
      mockAccountConsume.mockResolvedValue({
        allowed: false,
        retryAfterMs: 15_000,
      });

      const event = createRequestEvent({
        email: "test@example.com",
        password: "test-password",
      });
      const response = await POST(event);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("15");
      expect(mockGetPasswordHashByEmail).not.toHaveBeenCalled();
    });

    it("checks both IP and account keyed on the request, not on stale state", async () => {
      const event = createRequestEvent(
        { email: "Test@Example.com", password: "test-password" },
        "198.51.100.7",
      );
      mockGetPasswordHashByEmail.mockResolvedValue(null);

      await POST(event);

      expect(mockIpConsume).toHaveBeenCalledWith("ip:198.51.100.7");
      // Email is lowercased before being used as a limiter key.
      expect(mockAccountConsume).toHaveBeenCalledWith("email:test@example.com");
    });

    it("resets the account limiter on successful login", async () => {
      mockGetPasswordHashByEmail.mockResolvedValue({
        user: {
          id: "user-1",
          email: "test@example.com",
          createdAt: new Date().toISOString(),
        },
        passwordHash: testPasswordHash,
      });
      mockVerifyPassword.mockResolvedValue(true);
      mockCreateSession.mockResolvedValue({ token: "session-id.secret" });

      const event = createRequestEvent({
        email: "test@example.com",
        password: "test-password",
      });
      await POST(event);

      expect(mockAccountReset).toHaveBeenCalledWith("email:test@example.com");
    });

    it("does not reset the account limiter on failed login", async () => {
      mockGetPasswordHashByEmail.mockResolvedValue({
        user: {
          id: "user-1",
          email: "test@example.com",
          createdAt: new Date().toISOString(),
        },
        passwordHash: testPasswordHash,
      });
      mockVerifyPassword.mockResolvedValue(false);

      const event = createRequestEvent({
        email: "test@example.com",
        password: "wrong-password",
      });
      await POST(event);

      expect(mockAccountReset).not.toHaveBeenCalled();
    });
  });
});
