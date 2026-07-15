import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AppSpecSchema } from "$lib/server/domain/app-spec";
import { z } from "zod";
import { app } from "$lib/server/app";

const DeployRequestSchema = z.object({
  serverId: z.string().min(1),
  appSpec: AppSpecSchema,
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.session || !locals.orgId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DeployRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await app.useCases.deployApp(
      locals.orgId,
      parsed.data.appSpec,
      parsed.data.serverId,
    );
    return json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deployment failed";
    return json({ error: message }, { status: 500 });
  }
};
