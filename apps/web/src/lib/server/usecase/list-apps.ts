import type { Repository } from "../ports/repository";
import type { App } from "../domain/app";

export function createListApps(repo: Repository) {
  return async function listApps(): Promise<App[]> {
    return repo.listApps();
  };
}
