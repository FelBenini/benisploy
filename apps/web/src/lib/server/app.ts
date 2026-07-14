import { db } from "$lib/server/db/client";
import type { DbExecutor } from "$lib/server/ports/repository";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import { NopNodeAgentClient } from "$lib/server/adapters/node-agent/nop";
import { createRegisterServer } from "$lib/server/usecase/register-server";
import { createDeployApp } from "$lib/server/usecase/deploy-app";
import { createListApps } from "$lib/server/usecase/list-apps";
import { createGetApp } from "$lib/server/usecase/get-app";
import {
  createSession,
  validateSessionToken,
  deleteSession,
} from "$lib/server/auth/session";
import { hashPassword, verifyPassword } from "$lib/server/auth/password";

const repo = new DrizzleRepository(db);
const nodeAgent = new NopNodeAgentClient();

export const app = {
  db,
  repo,
  useCases: {
    registerServer: createRegisterServer(repo),
    deployApp: createDeployApp(repo, nodeAgent),
    listApps: createListApps(repo),
    getApp: createGetApp(repo),
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
};
