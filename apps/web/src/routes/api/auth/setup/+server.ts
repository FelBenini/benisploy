import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { app } from "$lib/server/app";
import type { DbExecutor } from "$lib/server/ports/repository";
import {
  SESSION_COOKIE,
  SESSION_EXPIRES_IN_SECONDS,
} from "$lib/server/auth/session";

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST: RequestHandler = async ({ request, cookies }) => {
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

  try {
    const result = await app.db.transaction(async (tx: DbExecutor) => {
      const acquired = await app.repo.systemSetup.tryAcquire(tx);

      if (!acquired) {
        throw new Error("ALREADY_CONFIGURED");
      }

      const orgId = createId();
      const userId = createId();
      const now = new Date();
      const passwordHash = await app.auth.hashPassword(password);

      await app.repo.orgs.create(tx, {
        id: orgId,
        name: "Default",
        slug: "default",
        createdAt: now,
        updatedAt: now,
      });

      await app.repo.users.create(
        tx,
        orgId,
        {
          id: userId,
          email,
          createdAt: now.toISOString(),
        },
        passwordHash,
      );

      await app.repo.memberships.create(tx, {
        userId,
        orgId,
        role: "admin",
        createdAt: now,
      });

      const session = await app.auth.createSession(tx, userId);

      return {
        session,
        user: { id: userId, email },
      };
    });

    cookies.set(SESSION_COOKIE, result.session.token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_EXPIRES_IN_SECONDS,
    });

    return json({ user: result.user });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_CONFIGURED") {
      return json({ error: "System is already configured" }, { status: 400 });
    }
    throw err;
  }
};
