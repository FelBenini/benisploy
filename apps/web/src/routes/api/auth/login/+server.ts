import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { db } from "$lib/server/db/client";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_EXPIRES_IN_SECONDS,
} from "$lib/server/auth/session";
import { verifyPassword } from "$lib/server/auth/password";

const repo = new DrizzleRepository(db);

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
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

  const { email, password } = parsed.data;

  const result = await repo.users.getPasswordHashByEmail(email);
  if (!result) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, result.passwordHash);
  if (!valid) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await createSession(repo.sessions, result.user.id);

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
