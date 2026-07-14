CREATE TABLE "system_setup" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"configured" boolean DEFAULT true NOT NULL,
	"setup_at" timestamp with time zone
);
