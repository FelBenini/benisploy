import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "./test-utils";
import { createRegisterServer } from "./register-server";
import type { CreateServerInput } from "../domain/server";

describe("registerServer", () => {
  it("creates a server with the provided input", async () => {
    const repo = new InMemoryRepository();
    const registerServer = createRegisterServer(repo);

    const input: CreateServerInput = {
      name: "my-server",
      address: "192.168.1.100",
      cpuCores: 4,
      memoryBytes: 8_000_000_000,
      diskBytes: 100_000_000_000,
      labels: { region: "us-east" },
    };

    const server = await registerServer(input);

    expect(server.id).toBeDefined();
    expect(server.name).toBe("my-server");
    expect(server.address).toBe("192.168.1.100");
    expect(server.cpuCores).toBe(4);
    expect(server.memoryBytes).toBe(8_000_000_000);
    expect(server.diskBytes).toBe(100_000_000_000);
    expect(server.labels).toEqual({ region: "us-east" });
    expect(server.status).toBe("offline");
    expect(server.createdAt).toBeDefined();
    expect(server.updatedAt).toBeDefined();
  });

  it("defaults labels to empty object when not provided", async () => {
    const repo = new InMemoryRepository();
    const registerServer = createRegisterServer(repo);

    const input: CreateServerInput = {
      name: "minimal-server",
      address: "10.0.0.1",
      cpuCores: 2,
      memoryBytes: 4_000_000_000,
      diskBytes: 50_000_000_000,
    };

    const server = await registerServer(input);

    expect(server.labels).toEqual({});
  });

  it("persists the server in the repository", async () => {
    const repo = new InMemoryRepository();
    const registerServer = createRegisterServer(repo);

    const input: CreateServerInput = {
      name: "persist-test",
      address: "10.0.0.2",
      cpuCores: 8,
      memoryBytes: 16_000_000_000,
      diskBytes: 200_000_000_000,
    };

    const server = await registerServer(input);
    const stored = await repo.getServer(server.id);

    expect(stored).not.toBeNull();
    expect(stored!.id).toBe(server.id);
  });
});
