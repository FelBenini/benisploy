import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "./setup/$types";

let mockTryAcquire: ReturnType<typeof vi.fn>;
let mockOrgCreate: ReturnType<typeof vi.fn>;
let mockUserCreate: ReturnType<typeof vi.fn>;
let mockMembershipCreate: ReturnType<typeof vi.fn>;
let mockCreateSession: ReturnType<typeof vi.fn>;
let mockHashPassword: ReturnType<typeof vi.fn>;
let mockTransaction: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockTryAcquire = vi.fn();
  mockOrgCreate = vi.fn();
  mockUserCreate = vi.fn();
  mockMembershipCreate = vi.fn();
  mockCreateSession = vi.fn();
  mockHashPassword = vi.fn();
  mockTransaction = vi.fn();
  return {
    app: {
      db: { transaction: mockTransaction },
      repo: {
        systemSetup: { tryAcquire: mockTryAcquire },
        orgs: { create: mockOrgCreate },
        users: { create: mockUserCreate },
        memberships: { create: mockMembershipCreate },
      },
      auth: {
        createSession: mockCreateSession,
        hashPassword: mockHashPassword,
      },
      systemSetup: { isConfigured: vi.fn(), tryAcquire: mockTryAcquire },
    },
  };
});

const { POST } = await import("./setup/+server");

function createRequestEvent(body: unknown): RequestEvent {
  return {
    request: new Request("http://localhost:5173/api/auth/setup", {
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
    locals: {},
  } as unknown as RequestEvent;
}

describe("POST /api/auth/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHashPassword.mockResolvedValue("hashed-password");
  });

  it("returns 400 when system is already configured", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockTryAcquire.mockResolvedValue(false);

    const event = createRequestEvent({
      email: "admin@test.com",
      password: "password123",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("System is already configured");
  });

  it("returns 200 with user data on first setup", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockTryAcquire.mockResolvedValue(true);
    mockOrgCreate.mockResolvedValue({});
    mockUserCreate.mockResolvedValue({});
    mockMembershipCreate.mockResolvedValue({});
    mockCreateSession.mockResolvedValue({ token: "session-id.secret" });

    const event = createRequestEvent({
      email: "admin@test.com",
      password: "password123",
    });
    const response = await POST(event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("admin@test.com");
  });

  it("returns 400 for invalid email", async () => {
    const event = createRequestEvent({
      email: "not-email",
      password: "password123",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 for short password", async () => {
    const event = createRequestEvent({
      email: "admin@test.com",
      password: "1234567",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-JSON body", async () => {
    const event = {
      request: new Request("http://localhost:5173/api/auth/setup", {
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
      locals: {},
    } as unknown as RequestEvent;

    const response = await POST(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("creates org, user, and membership inside the transaction", async () => {
    const fakeTx = {};
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(fakeTx),
    );
    mockTryAcquire.mockResolvedValue(true);
    mockOrgCreate.mockResolvedValue({});
    mockUserCreate.mockResolvedValue({});
    mockMembershipCreate.mockResolvedValue({});
    mockCreateSession.mockResolvedValue({ token: "session-id.secret" });

    const event = createRequestEvent({
      email: "admin@test.com",
      password: "password123",
    });
    await POST(event);

    expect(mockTryAcquire).toHaveBeenCalledWith(fakeTx);
    expect(mockOrgCreate).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ name: "Default", slug: "default" }),
    );
    expect(mockUserCreate).toHaveBeenCalledWith(
      fakeTx,
      expect.any(String),
      expect.objectContaining({ email: "admin@test.com" }),
      expect.any(String),
    );
    expect(mockMembershipCreate).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ role: "admin" }),
    );
  });

  it("rolls back and returns 400 on concurrent setup", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockTryAcquire.mockResolvedValue(false);

    const event = createRequestEvent({
      email: "admin@test.com",
      password: "password123",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
    expect(mockOrgCreate).not.toHaveBeenCalled();
  });

  it("sets session cookie on successful setup", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockTryAcquire.mockResolvedValue(true);
    mockOrgCreate.mockResolvedValue({});
    mockUserCreate.mockResolvedValue({});
    mockMembershipCreate.mockResolvedValue({});
    mockCreateSession.mockResolvedValue({ token: "session-id.secret" });

    const cookieSet = vi.fn();
    const event = {
      request: new Request("http://localhost:5173/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
          Host: "localhost:5173",
        },
        body: JSON.stringify({
          email: "admin@test.com",
          password: "password123",
        }),
      }),
      cookies: {
        get: vi.fn(),
        set: cookieSet,
        delete: vi.fn(),
        serialize: vi.fn(),
      },
      locals: {},
    } as unknown as RequestEvent;

    await POST(event);
    expect(cookieSet).toHaveBeenCalledWith(
      "session_token",
      expect.stringContaining("."),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      }),
    );
  });
});
