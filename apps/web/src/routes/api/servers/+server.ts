import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { CreateServerInputSchema } from "$lib/server/domain/server";
import { app } from "$lib/server/app";

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

  const parsed = CreateServerInputSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const server = await app.useCases.registerServer(locals.orgId, parsed.data);
  return json({ data: server }, { status: 201 });
};
