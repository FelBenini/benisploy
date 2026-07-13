import type { Handle } from "@sveltejs/kit";
import { app } from "$lib/server/app";
import { SESSION_COOKIE } from "$lib/server/auth/session";

export const handle: Handle = async ({ event, resolve }) => {
  // CSRF protection
  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    const origin = event.request.headers.get("Origin");
    const host = event.request.headers.get("Host");
    if (!origin || !host) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return new Response("Forbidden", { status: 403 });
      }
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // Session validation + org resolution
  const token = event.cookies.get(SESSION_COOKIE);

  if (token) {
    const session = await app.auth.validateSessionToken(token);
    if (session) {
      event.locals.session = session;
      const membership = await app.repo.memberships.findByUserId(
        session.userId,
      );
      event.locals.orgId = membership?.orgId ?? null;
    } else {
      event.locals.session = null;
      event.locals.orgId = null;
      event.cookies.delete(SESSION_COOKIE, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
    }
  } else {
    event.locals.session = null;
    event.locals.orgId = null;
  }

  const response = await resolve(event);
  return response;
};
