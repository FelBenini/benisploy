import type { RequestHandler } from "./$types";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import { db } from "$lib/server/db/client";
import { deleteSession, SESSION_COOKIE } from "$lib/server/auth/session";

const repo = new DrizzleRepository(db);

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const session = locals.session;
  if (session) {
    await deleteSession(repo.sessions, session.id);
  }

  cookies.delete(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  return new Response(null, { status: 204 });
};
