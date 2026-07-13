import { redirect } from "@sveltejs/kit";
import { encodeSessionPublicJSON } from "$lib/server/domain/session";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw redirect(302, "/login");
  }
  return {
    session: JSON.parse(encodeSessionPublicJSON(locals.session)),
  };
};
