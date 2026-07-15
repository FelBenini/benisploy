import type { Repository } from "../../ports/repository";
import { NodeAgentWsServer } from "./node-agent-ws-server";
import { db } from "$lib/server/db/client";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";

let instance: NodeAgentWsServer | null = null;

export function createNodeAgentWsServer(
  repo: Repository,
  port?: number,
): NodeAgentWsServer {
  if (instance) return instance;

  const wsPort = port ?? parseInt(process.env.NODE_AGENT_WS_PORT || "3001", 10);
  instance = new NodeAgentWsServer(repo, wsPort);
  return instance;
}

export function getNodeAgentWsServer(): NodeAgentWsServer {
  if (!instance) throw new Error("NodeAgentWsServer not initialized");
  return instance;
}

export { NodeAgentWsServer } from "./node-agent-ws-server";
