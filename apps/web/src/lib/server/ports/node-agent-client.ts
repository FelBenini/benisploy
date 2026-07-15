import type { AppSpec } from "../domain/app-spec";
import type { ServerStatusReport } from "../domain/server";

export interface LogEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

export interface DeploymentResult {
  success: boolean;
  error?: string;
}

export interface DeploymentMeta {
  orgId: string;
  appId: string;
}

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
