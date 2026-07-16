export interface LogEntry {
  timestamp: string;
  stream: "stdout" | "stderr";
  message: string;
}

export interface ContainerState {
  id: string;
  name: string;
  image: string;
  project: string;
  service: string;
  created: string;
  state: string;
  status: string;
  ports: string;
  health?: string;
}

export interface NodeCommandClient {
  deploy(
    serverId: string,
    appId: string,
    composeYaml: string,
  ): AsyncIterable<LogEntry>;
  restart(serverId: string, appId: string): Promise<void>;
  stop(serverId: string, appId: string): Promise<void>;
  remove(serverId: string, appId: string, volumes: boolean): Promise<void>;
  status(serverId: string, appId: string): Promise<ContainerState[]>;
  logs(serverId: string, appId: string, lines: number): Promise<LogEntry[]>;
  isReachable(serverId: string): Promise<boolean>;
}
