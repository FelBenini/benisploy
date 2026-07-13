import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { app } from "$lib/server/app";
import {
  SESSION_COOKIE,
  SESSION_EXPIRES_IN_SECONDS,
} from "$lib/server/auth/session";

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  const configured = await app.systemSetup.isConfigured();
  if (configured) {
    return json({ error: "System is already configured" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const orgId = createId();
  const userId = createId();
  const now = new Date();
  const passwordHash = await app.auth.hashPassword(password);

  await app.repo.orgs.create({
    id: orgId,
    name: "Default",
    slug: "default",
    createdAt: now,
    updatedAt: now,
  });

  await app.repo.users.create(
    orgId,
    {
      id: userId,
      email,
      createdAt: now.toISOString(),
    },
    passwordHash,
  );

  await app.repo.memberships.create({
    userId,
    orgId,
    role: "admin",
    createdAt: now,
  });

  const session = await app.auth.createSession(userId);

  await app.systemSetup.markAsConfigured();

  cookies.set(SESSION_COOKIE, session.token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_EXPIRES_IN_SECONDS,
  });

  return json({
    user: { id: userId, email },
  });
};
