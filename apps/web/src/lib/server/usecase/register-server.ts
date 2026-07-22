import { generateKeyPairSync } from "crypto";
import type { Repository } from "../ports/repository";
import type { Server, CreateServerInput } from "../domain/server";

export function createRegisterServer(repo: Repository) {
  return async function registerServer(
    orgId: string,
    input: CreateServerInput,
  ): Promise<Server> {
    const now = new Date().toISOString();

    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const server: Server = {
      id: crypto.randomUUID(),
      ...input,
      sshPort: input.sshPort ?? 22,
      sshUser: input.sshUser ?? "root",
      sshPrivateKey: keyPair.privateKey,
      labels: input.labels ?? {},
      status: "offline",
      lastHeartbeatAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return repo.servers.create(orgId, server);
  };
}
