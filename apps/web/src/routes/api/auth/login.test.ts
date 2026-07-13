import { describe, it, expect, vi, beforeAll } from "vitest";
import { hashPassword } from "$lib/server/auth/password";
import type { RequestEvent } from "./login/$types";

let testPasswordHash: string;

vi.mock("$lib/server/db/client", () => ({ db: {} }));

const mockSessionCreate = vi.fn();
const mockGetPasswordHashByEmail = vi.fn();

vi.mock("$lib/server/adapters/db/drizzle-repository", () => ({
  DrizzleRepository: vi.fn(() => ({
    sessions: {
      create: mockSessionCreate,
      get: vi.fn(),
      delete: vi.fn(),
      deleteAllForUser: vi.fn(),
    },
    users: { getPasswordHashByEmail: mockGetPasswordHashByEmail },
    servers: {},
    apps: {},
    deployments: {},
  })),
}));

const { POST } = await import("./login/+server");

function createRequestEvent(
  body: unknown,
  cookies?: Record<string, never>,
): RequestEvent {
  const cookieMap = new Map(Object.entries(cookies ?? {}));

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
      get: vi.fn((name: string) => cookieMap.get(name) ?? null),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    locals: {},
  } as unknown as RequestEvent;
}

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    vi.clearAllMocks();
    testPasswordHash = await hashPassword("test-password");
    mockGetPasswordHashByEmail.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        createdAt: new Date().toISOString(),
      },
      passwordHash: testPasswordHash,
    });
    mockSessionCreate.mockResolvedValue(undefined);
  });

  it("returns 200 with user data for valid credentials", async () => {
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
    mockGetPasswordHashByEmail.mockResolvedValueOnce(null);
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
      locals: {},
    } as unknown as RequestEvent;

    const response = await POST(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });
});
