import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { app } from "$lib/server/app";
import {
  SESSION_COOKIE,
  SESSION_EXPIRES_IN_SECONDS,
} from "$lib/server/auth/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST: RequestHandler = async ({
  request,
  cookies,
  getClientAddress,
}) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const ipCheck = await app.rateLimiters.loginByIp.consume(
    `ip:${getClientAddress()}`,
  );
  const accountCheck = await app.rateLimiters.loginByAccount.consume(
    `email:${email}`,
  );

  if (!ipCheck.allowed || !accountCheck.allowed) {
    const retryAfterMs = Math.max(
      ipCheck.retryAfterMs,
      accountCheck.retryAfterMs,
    );
    return json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  const result = await app.repo.users.getPasswordHashByEmail(email);
  if (!result) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await app.auth.verifyPassword(password, result.passwordHash);
  if (!valid) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  await app.rateLimiters.loginByAccount.reset(`email:${email}`);

  const session = await app.auth.createSession(app.db, result.user.id);

  cookies.set(SESSION_COOKIE, session.token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_EXPIRES_IN_SECONDS,
  });

  return json({
    user: {
      id: result.user.id,
      email: result.user.email,
    },
  });
};
