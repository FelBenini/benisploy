import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "./logout/$types";
import type { Session } from "$lib/server/domain/session";

vi.mock("$lib/server/db/client", () => ({ db: {} }));

const mockSessionDelete = vi.fn();

vi.mock("$lib/server/adapters/db/drizzle-repository", () => ({
  DrizzleRepository: vi.fn(() => ({
    sessions: {
      create: vi.fn(),
      get: vi.fn(),
      delete: mockSessionDelete,
      deleteAllForUser: vi.fn(),
    },
    users: {},
    servers: {},
    apps: {},
    deployments: {},
  })),
}));

const { POST } = await import("./logout/+server");

function mockSession(): Session {
  return {
    id: "session-1",
    userId: "user-1",
    secretHash: new Uint8Array(32),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("returns 204 and clears cookie when session exists", async () => {
    const cookieDelete = vi.fn();
    const event = {
      cookies: {
        delete: cookieDelete,
        get: vi.fn(),
        set: vi.fn(),
        serialize: vi.fn(),
      },
      locals: { session: mockSession() },
    } as unknown as RequestEvent;

    const response = await POST(event);

    expect(response.status).toBe(204);
    expect(mockSessionDelete).toHaveBeenCalledWith("session-1");
    expect(cookieDelete).toHaveBeenCalled();
  });

  it("returns 204 and clears cookie when no session", async () => {
    const cookieDelete = vi.fn();
    const event = {
      cookies: {
        delete: cookieDelete,
        get: vi.fn(),
        set: vi.fn(),
        serialize: vi.fn(),
      },
      locals: { session: null },
    } as unknown as RequestEvent;

    const response = await POST(event);

    expect(response.status).toBe(204);
    expect(mockSessionDelete).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalled();
  });
});
