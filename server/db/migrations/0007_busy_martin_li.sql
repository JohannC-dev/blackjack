CREATE TABLE "deployment_version" (
	"id" integer PRIMARY KEY NOT NULL,
	"code_revision" text NOT NULL,
	"database_revision" text NOT NULL,
	CONSTRAINT "deployment_version_singleton" CHECK ("deployment_version"."id" = 1)
);
