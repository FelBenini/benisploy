import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "./logout/$types";
import type { Session } from "$lib/server/domain/session";

let mockDeleteSession: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockDeleteSession = vi.fn();
  return {
    app: { auth: { deleteSession: mockDeleteSession } },
  };
});

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
    expect(mockDeleteSession).toHaveBeenCalledWith("session-1");
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
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalled();
  });
});
