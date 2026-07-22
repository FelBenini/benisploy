import { sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import type { DbExecutor } from "$lib/server/ports/repository";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import { createNodeAgentWsServer } from "$lib/server/adapters/node-agent-ws";
import { SshNodeCommandClient } from "$lib/server/adapters/node-ssh";
import { encrypt, decrypt } from "$lib/server/adapters/encryption";
import { InMemoryRateLimiter } from "$lib/server/adapters/rate-limit/in-memory";
import { createRegisterServer } from "$lib/server/usecase/register-server";
import { createDeployApp } from "$lib/server/usecase/deploy-app";
import { createDeployAppV2 } from "$lib/server/usecase/deploy-app-v2";
import { createListApps } from "$lib/server/usecase/list-apps";
import { createGetApp } from "$lib/server/usecase/get-app";
import { createGetServerStatus } from "$lib/server/usecase/get-server-status";
import {
  createSession,
  validateSessionToken,
  deleteSession,
} from "$lib/server/auth/session";
import { hashPassword, verifyPassword } from "$lib/server/auth/password";

import { env } from "$env/dynamic/private";

const encryptionKey = env.ENCRYPTION_KEY || "";
const hasEncryption = encryptionKey.length > 0;
const encryptKey = hasEncryption
  ? (s: string) => encrypt(s, encryptionKey)
  : undefined;
const decryptKey = hasEncryption
  ? (s: string) => decrypt(s, encryptionKey)
  : undefined;
const repo = new DrizzleRepository(db, encryptKey, decryptKey);
const nodeAgent = createNodeAgentWsServer(repo);

const nodeSshClient = new SshNodeCommandClient(async (serverId: string) => {
  const server = await repo.servers.getByIdAny(serverId);
  return server ?? null;
});

const loginIpLimiter = new InMemoryRateLimiter(20, 15 * 60 * 1000);
const loginAccountLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000);

const rateLimiterSweepInterval = setInterval(
  () => {
    loginIpLimiter.sweep();
    loginAccountLimiter.sweep();
  },
  5 * 60 * 1000,
);
(rateLimiterSweepInterval as { unref?: () => void }).unref?.();

// Stale-server sweep: every 30s, flip servers to offline if no heartbeat
// in >3× the default node-agent heartbeat interval (i.e. >30s).
const staleSweepInterval = setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 35_000).toISOString();
    await db.execute(
      sql`UPDATE servers SET status = 'offline', "updatedAt" = NOW()
          WHERE status = 'online' AND "lastHeartbeatAt" IS NOT NULL AND "lastHeartbeatAt" < ${cutoff}::timestamptz`,
    );
  } catch (err) {
    console.error("stale-server sweep failed:", err);
  }
}, 30_000);
(staleSweepInterval as { unref?: () => void }).unref?.();

export const app = {
  db,
  repo,
  nodeSshClient,
  adapters: {
    wsNodeAgent: nodeAgent,
    sshNodeCommand: nodeSshClient,
  },
  useCases: {
    registerServer: createRegisterServer(repo),
    deployApp: createDeployApp(repo, nodeAgent),
    deployAppV2: createDeployAppV2(repo, nodeSshClient),
    listApps: createListApps(repo),
    getApp: createGetApp(repo),
    getServerStatus: createGetServerStatus(repo, nodeAgent),
  },
  auth: {
    createSession: (executor: DbExecutor, userId: string) =>
      createSession(executor, repo.sessions, userId),
    validateSessionToken: (token: string) =>
      validateSessionToken(repo.sessions, token),
    deleteSession: (sessionId: string) =>
      deleteSession(repo.sessions, sessionId),
    hashPassword,
    verifyPassword,
  },
  systemSetup: repo.systemSetup,
  rateLimiters: {
    loginByIp: loginIpLimiter,
    loginByAccount: loginAccountLimiter,
  },
};
