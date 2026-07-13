import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { encodeSessionPublicJSON } from "$lib/server/domain/session";

export const GET: RequestHandler = async ({ locals }) => {
  const session = locals.session;
  if (!session) {
    return json({ session: null });
  }
  return json({ session: JSON.parse(encodeSessionPublicJSON(session)) });
};
