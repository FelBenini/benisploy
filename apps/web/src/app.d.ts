import type { Session } from "$lib/server/domain/session";

declare global {
  namespace App {
    interface Locals {
      session: Session | null;
      orgId: string | null;
    }
  }
}

export {};
