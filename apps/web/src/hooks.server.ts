import type { Handle } from "@sveltejs/kit";
import { db } from "$lib/server/db/client";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import {
  validateSessionToken,
  verifyRequestOrigin,
} from "$lib/server/auth/session";

const repo = new DrizzleRepository(db);

const SESSION_COOKIE = "session_token";
const SESSION_COOKIE_MAX_AGE = 7 * 60 * 60 * 24; // 7 days

export const handle: Handle = async ({ event, resolve }) => {
  // CSRF protection
  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    const origin = event.request.headers.get("Origin");
    const host = event.request.headers.get("Host");
    if (!verifyRequestOrigin(origin, host)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // Session validation
  const token = event.cookies.get(SESSION_COOKIE);

  if (token) {
    const session = await validateSessionToken(repo.sessions, token);
    if (session) {
      event.locals.session = session;
    } else {
      event.locals.session = null;
      event.cookies.delete(SESSION_COOKIE, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
    }
  } else {
    event.locals.session = null;
  }

  const response = await resolve(event);
  return response;
};
