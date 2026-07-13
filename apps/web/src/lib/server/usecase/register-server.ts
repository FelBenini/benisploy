import type { Repository } from "../ports/repository";
import type { Server, CreateServerInput } from "../domain/server";

export function createRegisterServer(repo: Repository) {
  return async function registerServer(
    input: CreateServerInput,
  ): Promise<Server> {
    const now = new Date().toISOString();
    const server: Server = {
      id: crypto.randomUUID(),
      ...input,
      labels: input.labels ?? {},
      status: "offline",
      createdAt: now,
      updatedAt: now,
    };
    return repo.createServer(server);
  };
}
