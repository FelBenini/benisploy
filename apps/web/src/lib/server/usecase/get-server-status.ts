import type { Repository } from "../ports/repository";
import type { NodeAgentClient } from "../ports/node-agent-client";
import type { ServerStatusReport } from "../domain/server";

export function createGetServerStatus(
  repo: Repository,
  nodeAgent: NodeAgentClient,
) {
  return async function getServerStatus(
    _orgId: string,
    serverId: string,
  ): Promise<ServerStatusReport> {
    const server = await repo.servers.getByIdAny(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      return await nodeAgent.getStatus(serverId);
    } catch {
      // Fall back to last known data from registration
      return {
        cpuPercent: 0,
        memoryUsed: 0,
        memoryTotal: server.memoryBytes,
        diskUsed: 0,
        diskTotal: server.diskBytes,
        containerCount: 0,
        uptimeSeconds: 0,
      };
    }
  };
}
