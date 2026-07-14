import type { NodeAgentClient, LogEntry } from "../../ports/node-agent-client";
import type { AppSpec } from "../../domain/app-spec";
import type { ServerStatusReport } from "../../domain/server";

export class NopNodeAgentClient implements NodeAgentClient {
  async deploy(
    _serverId: string,
    _deploymentId: string,
    _appSpec: AppSpec,
  ): Promise<void> {
    throw new Error("Node agent not connected");
  }

  async getStatus(_serverId: string): Promise<ServerStatusReport> {
    throw new Error("Node agent not connected");
  }

  async streamLogs(
    _serverId: string,
    _appId: string,
    _lines: number,
  ): Promise<LogEntry[]> {
    throw new Error("Node agent not connected");
  }

  async restartApp(_serverId: string, _appId: string): Promise<void> {
    throw new Error("Node agent not connected");
  }

  async removeApp(
    _serverId: string,
    _appId: string,
    _removeVolumes: boolean,
  ): Promise<void> {
    throw new Error("Node agent not connected");
  }

  async healthCheck(_serverId: string): Promise<boolean> {
    throw new Error("Node agent not connected");
  }
}
