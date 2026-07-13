import { redirect } from "@sveltejs/kit";
import { app } from "$lib/server/app";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.session) {
    throw redirect(302, "/");
  }
  const configured = await app.systemSetup.isConfigured();
  return { configured };
};
