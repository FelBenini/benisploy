import { describe, it, expect } from "vitest";
import type { RequestEvent } from "./session/$types";
import type { Session } from "$lib/server/domain/session";

const { GET } = await import("./session/+server");

function mockSession(): Session {
  return {
    id: "session-1",
    userId: "user-1",
    secretHash: new Uint8Array(32),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-01-02T00:00:00Z"),
  };
}

describe("GET /api/auth/session", () => {
  it("returns session data when session exists in locals", async () => {
    const event = {
      locals: { session: mockSession() },
    } as unknown as RequestEvent;

    const response = await GET(event);
    const body = await response.json();

    expect(body.session).not.toBeNull();
    expect(body.session.id).toBe("session-1");
    expect(body.session.user_id).toBe("user-1");
    expect(body.session.created_at).toBe(1767225600);
    expect(body.session.expires_at).toBe(1767312000);
    expect(body.session).not.toHaveProperty("secret_hash");
  });

  it("returns null session when not authenticated", async () => {
    const event = {
      locals: { session: null },
    } as unknown as RequestEvent;

    const response = await GET(event);
    const body = await response.json();

    expect(body.session).toBeNull();
  });
});
