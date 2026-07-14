import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "./$types";

let mockServerGet: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockServerGet = vi.fn();
  return {
    app: {
      repo: { servers: { get: mockServerGet } },
      useCases: {},
    },
  };
});

const { GET } = await import("./+server");

function createRequestEvent(
  params: { id: string },
  locals?: { session: unknown; orgId: string | null },
): RequestEvent {
  return {
    params,
    request: new Request("http://localhost:5173/api/servers/" + params.id, {
      method: "GET",
      headers: { Origin: "http://localhost:5173", Host: "localhost:5173" },
    }),
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    locals: locals ?? {
      session: { id: "sess-1", userId: "user-1" },
      orgId: "org-1",
    },
  } as unknown as RequestEvent;
}

describe("GET /api/servers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    const event = createRequestEvent(
      { id: "server-1" },
      { session: null, orgId: null },
    );
    const response = await GET(event);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when server not found", async () => {
    mockServerGet.mockResolvedValue(null);

    const event = createRequestEvent({ id: "nonexistent" });
    const response = await GET(event);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Server not found");
    expect(mockServerGet).toHaveBeenCalledWith("org-1", "nonexistent");
  });

  it("returns 200 with server data", async () => {
    const server = {
      id: "server-1",
      name: "my-server",
      address: "192.168.1.100",
      status: "offline",
      cpuCores: 4,
      memoryBytes: 8589934592,
      diskBytes: 256000000000,
      labels: {},
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    mockServerGet.mockResolvedValue(server);

    const event = createRequestEvent({ id: "server-1" });
    const response = await GET(event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(server);
    expect(mockServerGet).toHaveBeenCalledWith("org-1", "server-1");
  });
});
