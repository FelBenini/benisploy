import type { AppSpec } from "../domain/app-spec";
import type { ServerStatusReport } from "../domain/server";

/** @deprecated Use LogEntry from node-command-client instead. */
export interface LogEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

/** @deprecated Use the return type of NodeCommandClient.deploy() instead. */
export interface DeploymentResult {
  success: boolean;
  error?: string;
}

/** @deprecated No longer needed — deployment metadata is managed by the control plane. */
export interface DeploymentMeta {
  orgId: string;
  appId: string;
}

/** @deprecated Use NodeCommandClient from node-command-client instead.
 *
 * NodeAgentClient was designed for the v1 WebSocket-based node agent protocol.
 * It has been replaced by NodeCommandClient which represents the v2 SSH-shaped
 * control surface for nodes. Key differences:
 * - deploy() takes a composeYaml string instead of AppSpec
 * - deploy() returns AsyncIterable<LogEntry> for streaming, not callbacks
 * - status() returns per-app ContainerState[], not server-wide ServerStatusReport
 * - isReachable() replaces healthCheck()
 *
 * This interface is kept for backward compatibility during the v1→v2 migration.
 * New code should use NodeCommandClient. */
export interface NodeAgentClient {
  sendDeploy(
    serverId: string,
    deploymentId: string,
    appSpec: AppSpec,
    meta?: DeploymentMeta,
  ): Promise<void>;
  getStatus(serverId: string): Promise<ServerStatusReport>;
  streamLogs(
    serverId: string,
    appId: string,
    lines: number,
  ): Promise<LogEntry[]>;
  restartApp(serverId: string, appId: string): Promise<void>;
  removeApp(
    serverId: string,
    appId: string,
    removeVolumes: boolean,
  ): Promise<void>;
  healthCheck(serverId: string): Promise<boolean>;

  onDeploymentLog(
    deploymentId: string,
    callback: (entry: LogEntry) => void,
  ): () => void;

  onDeploymentComplete(
    deploymentId: string,
    callback: (result: DeploymentResult) => void,
  ): () => void;
}
