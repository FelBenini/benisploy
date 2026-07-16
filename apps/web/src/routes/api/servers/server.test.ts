import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "./$types";

let mockRegisterServer: ReturnType<typeof vi.fn>;

vi.mock("$lib/server/app", () => {
  mockRegisterServer = vi.fn();
  return {
    app: {
      useCases: { registerServer: mockRegisterServer },
      repo: {},
    },
  };
});

const { POST } = await import("./+server");

function createRequestEvent(
  body: unknown,
  locals?: { session: unknown; orgId: string | null },
): RequestEvent {
  return {
    request: new Request("http://localhost:5173/api/servers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        Host: "localhost:5173",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

const validInput = {
  name: "my-server",
  address: "192.168.1.100",
  cpuCores: 4,
  memoryBytes: 8589934592,
  diskBytes: 256000000000,
};

const validInputParsed = {
  ...validInput,
  sshPort: 22,
  sshUser: "root",
};

describe("POST /api/servers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    const event = createRequestEvent(validInput, {
      session: null,
      orgId: null,
    });
    const response = await POST(event);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for non-JSON body", async () => {
    const event = {
      request: new Request("http://localhost:5173/api/servers", {
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
      locals: { session: { id: "sess-1", userId: "user-1" }, orgId: "org-1" },
    } as unknown as RequestEvent;

    const response = await POST(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 for invalid input", async () => {
    const event = createRequestEvent({ name: "" });
    const response = await POST(event);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request");
    expect(body.details).toBeDefined();
  });

  it("returns 201 with server data on success", async () => {
    const createdServer = {
      id: "server-1",
      ...validInput,
      sshPort: 22,
      sshUser: "root",
      sshPrivateKey: "generated-key",
      labels: {},
      status: "offline",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    mockRegisterServer.mockResolvedValue(createdServer);

    const event = createRequestEvent(validInput);
    const response = await POST(event);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toEqual(createdServer);
    expect(mockRegisterServer).toHaveBeenCalledWith("org-1", validInputParsed);
  });
});
