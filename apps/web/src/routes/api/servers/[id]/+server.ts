import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { app } from "$lib/server/app";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.session || !locals.orgId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = await app.repo.servers.get(locals.orgId, params.id);
  if (!server) {
    return json({ error: "Server not found" }, { status: 404 });
  }

  return json({ data: server });
};
