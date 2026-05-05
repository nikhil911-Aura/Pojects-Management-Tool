-- Sync all schema changes that were applied via `prisma db push` but never
-- captured in a migration file. Every statement uses IF NOT EXISTS / DO blocks
-- so it is safe to run against a database that already has some or all of these
-- changes applied.

-- ── TaskStatus enum – add BLOCKED and NEXT_SPRINT ────────────────────────────
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'NEXT_SPRINT';

-- ── WorkspaceMember – lastInboxSeenAt + customRoleId ─────────────────────────
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "lastInboxSeenAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_customRoleId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceMember"
      ADD CONSTRAINT "WorkspaceMember_customRoleId_fkey"
      FOREIGN KEY ("customRoleId") REFERENCES "CustomProjectRole"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkspaceMember_customRoleId_idx" ON "WorkspaceMember"("customRoleId");

-- ── WorkspaceInvite – customRoleId + projectIds ───────────────────────────────
ALTER TABLE "WorkspaceInvite" ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;
ALTER TABLE "WorkspaceInvite" ADD COLUMN IF NOT EXISTS "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceInvite_customRoleId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceInvite"
      ADD CONSTRAINT "WorkspaceInvite_customRoleId_fkey"
      FOREIGN KEY ("customRoleId") REFERENCES "CustomProjectRole"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'WorkspaceInvite' AND indexname = 'WorkspaceInvite_email_workspaceId_key'
  ) THEN
    CREATE UNIQUE INDEX "WorkspaceInvite_email_workspaceId_key"
      ON "WorkspaceInvite"("email", "workspaceId");
  END IF;
END $$;

-- ── Project – createdById ─────────────────────────────────────────────────────
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Project_createdById_fkey'
  ) THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CustomProjectRole – change scope from project to workspace ────────────────
-- Migration 2 created this table with projectId; db push changed it to workspaceId.
ALTER TABLE "CustomProjectRole" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomProjectRole_workspaceId_fkey'
  ) THEN
    ALTER TABLE "CustomProjectRole"
      ADD CONSTRAINT "CustomProjectRole_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CustomProjectRole_workspaceId_idx"
  ON "CustomProjectRole"("workspaceId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'CustomProjectRole' AND indexname = 'CustomProjectRole_workspaceId_name_key'
  ) THEN
    CREATE UNIQUE INDEX "CustomProjectRole_workspaceId_name_key"
      ON "CustomProjectRole"("workspaceId", "name");
  END IF;
END $$;

-- Drop old project-scoped FK and column if still present
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomProjectRole_projectId_fkey'
  ) THEN
    ALTER TABLE "CustomProjectRole" DROP CONSTRAINT "CustomProjectRole_projectId_fkey";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CustomProjectRole' AND column_name = 'projectId'
  ) THEN
    ALTER TABLE "CustomProjectRole" DROP COLUMN "projectId";
  END IF;
END $$;

-- ── Task – billable + linkedMilestoneId ───────────────────────────────────────
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "linkedMilestoneId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_linkedMilestoneId_fkey'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_linkedMilestoneId_fkey"
      FOREIGN KEY ("linkedMilestoneId") REFERENCES "Task"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Task_linkedMilestoneId_idx" ON "Task"("linkedMilestoneId");

-- ── Attachment – publicId ─────────────────────────────────────────────────────
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "publicId" TEXT;

-- ── UserViewPreference (new table) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserViewPreference" (
    "id" TEXT NOT NULL,
    "colWidths" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "UserViewPreference_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserViewPreference_userId_fkey'
  ) THEN
    ALTER TABLE "UserViewPreference"
      ADD CONSTRAINT "UserViewPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserViewPreference_projectId_fkey'
  ) THEN
    ALTER TABLE "UserViewPreference"
      ADD CONSTRAINT "UserViewPreference_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UserViewPreference_userId_projectId_key"
  ON "UserViewPreference"("userId", "projectId");

CREATE INDEX IF NOT EXISTS "UserViewPreference_userId_idx" ON "UserViewPreference"("userId");
CREATE INDEX IF NOT EXISTS "UserViewPreference_projectId_idx" ON "UserViewPreference"("projectId");

-- ── ReportRecipient (new table) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReportRecipient" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    CONSTRAINT "ReportRecipient_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportRecipient_workspaceId_fkey'
  ) THEN
    ALTER TABLE "ReportRecipient"
      ADD CONSTRAINT "ReportRecipient_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportRecipient_addedById_fkey'
  ) THEN
    ALTER TABLE "ReportRecipient"
      ADD CONSTRAINT "ReportRecipient_addedById_fkey"
      FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ReportRecipient_email_workspaceId_key"
  ON "ReportRecipient"("email", "workspaceId");

CREATE INDEX IF NOT EXISTS "ReportRecipient_workspaceId_idx" ON "ReportRecipient"("workspaceId");
