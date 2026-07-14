import { sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import type { DbExecutor } from "$lib/server/ports/repository";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import { createNodeAgentWsServer } from "$lib/server/adapters/node-agent-ws";
import { InMemoryRateLimiter } from "$lib/server/adapters/rate-limit/in-memory";
import { createRegisterServer } from "$lib/server/usecase/register-server";
import { createDeployApp } from "$lib/server/usecase/deploy-app";
import { createListApps } from "$lib/server/usecase/list-apps";
import { createGetApp } from "$lib/server/usecase/get-app";
import { createGetServerStatus } from "$lib/server/usecase/get-server-status";
import {
  createSession,
  validateSessionToken,
  deleteSession,
} from "$lib/server/auth/session";
import { hashPassword, verifyPassword } from "$lib/server/auth/password";

const repo = new DrizzleRepository(db);
const nodeAgent = createNodeAgentWsServer(repo);

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
  useCases: {
    registerServer: createRegisterServer(repo),
    deployApp: createDeployApp(repo, nodeAgent),
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
