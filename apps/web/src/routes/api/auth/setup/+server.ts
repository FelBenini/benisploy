import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { db } from "$lib/server/db/client";
import { DrizzleRepository } from "$lib/server/adapters/db/drizzle-repository";
import { createSession, SESSION_COOKIE, SESSION_EXPIRES_IN_SECONDS } from "$lib/server/auth/session";
import { hashPassword } from "$lib/server/auth/password";

const repo = new DrizzleRepository(db);

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
  const configured = await repo.systemSetup.isConfigured();
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
    return json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const orgId = createId();
  const userId = createId();
  const now = new Date();
  const passwordHash = await hashPassword(password);

  await repo.orgs.create({
    id: orgId,
    name: "Default",
    slug: "default",
    createdAt: now,
    updatedAt: now,
  });

  await repo.users.create(orgId, {
    id: userId,
    email,
    createdAt: now.toISOString(),
  }, passwordHash);

  await repo.memberships.create({
    userId,
    orgId,
    role: "admin",
    createdAt: now,
  });

  const session = await createSession(repo.sessions, userId);

  await repo.systemSetup.markAsConfigured();

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
