import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock the DB client and repository
vi.mock("$lib/server/db/client", () => ({
  db: {},
}));

vi.mock("$lib/server/adapters/db/drizzle-repository", () => {
  const mockSessions = {
    sessions: {
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteAllForUser: vi.fn(),
    },
  };
  return {
    DrizzleRepository: vi.fn(() => mockSessions),
  };
});

// Import after mocking
const { handle } = await import("./hooks.server");

function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  const cookies = new Map<string, string>();
  let setCookieHeaders: string[] = [];

  const event = {
    request: new Request("http://localhost:5173"),
    cookies: {
      get: vi.fn((name: string) => cookies.get(name) ?? null),
      set: vi.fn(
        (name: string, value: string, opts?: Record<string, unknown>) => {
          cookies.set(name, value);
          setCookieHeaders.push(`${name}=${value}`);
        },
      ),
      delete: vi.fn((name: string, _opts?: Record<string, unknown>) => {
        cookies.delete(name);
        setCookieHeaders.push(`${name}=; Max-Age=0`);
      }),
      serialize: vi.fn(),
    } as unknown as RequestEvent["cookies"],
    locals: {} as Record<string, unknown>,
    ...overrides,
  } as unknown as RequestEvent;

  return event;
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
  });

  it("blocks non-GET/HEAD requests with mismatched origin", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost:5173", { method: "POST" }),
    });

    event.request.headers.set("Origin", "https://attacker.com");
    event.request.headers.set("Host", "localhost:5173");

    const resolve = vi.fn();
    const response = await handle({ event, resolve });

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("allows POST requests with matching origin", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost:5173", { method: "POST" }),
    });

    event.request.headers.set("Origin", "http://localhost:5173");
    event.request.headers.set("Host", "localhost:5173");

    const resolve = vi.fn().mockResolvedValue(new Response("ok"));

    // Manually set session to null to bypass the cookie check
    vi.mocked(event.cookies.get).mockReturnValue(undefined);

    const response = await handle({ event, resolve });

    expect(resolve).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
