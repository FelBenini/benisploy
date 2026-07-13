import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Repository } from "../../ports/repository";
import * as schema from "../../db/schema";
import { DrizzleServerRepository } from "./servers";
import { DrizzleAppRepository } from "./apps";
import { DrizzleDeploymentRepository } from "./deployments";
import { DrizzleUserRepository } from "./users";

export type DrizzleDB = NodePgDatabase<typeof schema>;

export class DrizzleRepository implements Repository {
  servers: DrizzleServerRepository;
  apps: DrizzleAppRepository;
  deployments: DrizzleDeploymentRepository;
  users: DrizzleUserRepository;

  constructor(db: DrizzleDB) {
    this.servers = new DrizzleServerRepository(db);
    this.apps = new DrizzleAppRepository(db);
    this.deployments = new DrizzleDeploymentRepository(db);
    this.users = new DrizzleUserRepository(db);
  }
}
