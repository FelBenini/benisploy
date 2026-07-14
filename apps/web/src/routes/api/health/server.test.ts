import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RequestHandler } from "./$types";

const mockCheckDbConnection = vi.hoisted(() => vi.fn());

vi.mock("$lib/server/db/client", () => ({
  checkDbConnection: mockCheckDbConnection,
}));

const { GET } = await import("./+server");

function createRequestEvent() {
  return {
    request: new Request("http://localhost:5173/api/health", {
      method: "GET",
    }),
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    locals: {},
  } as unknown as Parameters<RequestHandler>[0];
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 with healthy status when DB is reachable", async () => {
    mockCheckDbConnection.mockResolvedValue(undefined);

    const response = await GET(createRequestEvent());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 when DB is unreachable", async () => {
    vi.advanceTimersByTime(10_000);
    mockCheckDbConnection.mockRejectedValue(new Error("Connection refused"));

    const response = await GET(createRequestEvent());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.message).toBe("Connection refused");
  });
});
