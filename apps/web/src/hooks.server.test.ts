import { describe, it, expect, vi, beforeEach } from "vitest";

let mockValidateSessionToken: ReturnType<typeof vi.fn>;
let mockFindByUserId: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockValidateSessionToken = vi.fn();
  mockFindByUserId = vi.fn();
  return {
    app: {
      auth: { validateSessionToken: mockValidateSessionToken },
      repo: { memberships: { findByUserId: mockFindByUserId } },
    },
  };
});

const { handle } = await import("./hooks.server");

function createMockEvent() {
  return {
    request: new Request("http://localhost:5173"),
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    locals: {} as Record<string, unknown>,
  } as any;
}

describe("handle hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through for GET requests without a session token", async () => {
    const event = createMockEvent();
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handle({ event, resolve });

    expect(resolve).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(event.locals.session).toBeNull();
    expect(event.locals.orgId).toBeNull();
  });

  it("blocks non-GET/HEAD requests with mismatched origin", async () => {
    const event = createMockEvent();
    event.request = new Request("http://localhost:5173", { method: "POST" });
    event.request.headers.set("Origin", "https://attacker.com");
    event.request.headers.set("Host", "localhost:5173");

    const resolve = vi.fn();
    const response = await handle({ event, resolve });

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("blocks non-GET/HEAD requests with missing origin", async () => {
    const event = createMockEvent();
    event.request = new Request("http://localhost:5173", { method: "POST" });
    event.request.headers.set("Host", "localhost:5173");

    const resolve = vi.fn();
    const response = await handle({ event, resolve });

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("allows POST requests with matching origin", async () => {
    const event = createMockEvent();
    event.request = new Request("http://localhost:5173", { method: "POST" });
    event.request.headers.set("Origin", "http://localhost:5173");
    event.request.headers.set("Host", "localhost:5173");

    const resolve = vi.fn().mockResolvedValue(new Response("ok"));

    const response = await handle({ event, resolve });

    expect(resolve).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("resolves orgId from session membership", async () => {
    const event = createMockEvent();
    const mockSession = {
      id: "s1",
      userId: "u1",
      secretHash: new Uint8Array(32),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    };
    mockValidateSessionToken.mockResolvedValue(mockSession);
    mockFindByUserId.mockResolvedValue({
      userId: "u1",
      orgId: "org-1",
      role: "admin",
      createdAt: new Date(),
    });
    vi.mocked(event.cookies.get).mockReturnValue("valid-token");

    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    await handle({ event, resolve });

    expect(event.locals.session).toBe(mockSession);
    expect(event.locals.orgId).toBe("org-1");
  });

  it("sets session and orgId to null for invalid token", async () => {
    const event = createMockEvent();
    mockValidateSessionToken.mockResolvedValue(null);
    vi.mocked(event.cookies.get).mockReturnValue("invalid-token");

    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const cookieDelete = vi.mocked(event.cookies.delete);

    await handle({ event, resolve });

    expect(event.locals.session).toBeNull();
    expect(event.locals.orgId).toBeNull();
    expect(cookieDelete).toHaveBeenCalled();
  });
});
