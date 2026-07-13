import type { Repository } from "../ports/repository";
import type { App } from "../domain/app";

export function createListApps(repo: Repository) {
  return async function listApps(orgId: string): Promise<App[]> {
    return repo.apps.list(orgId);
  };
}
