import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().min(1).describe("Unique user identifier (ULID)"),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
