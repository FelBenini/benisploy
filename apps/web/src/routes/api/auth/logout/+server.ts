import type { RequestHandler } from "./$types";
import { app } from "$lib/server/app";
import { SESSION_COOKIE } from "$lib/server/auth/session";

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const session = locals.session;
  if (session) {
    await app.auth.deleteSession(session.id);
  }

  cookies.delete(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  return new Response(null, { status: 204 });
};
