ALTER TABLE "servers" ADD COLUMN "sshPort" integer DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sshUser" text DEFAULT 'root' NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "sshPrivateKey" text NOT NULL;