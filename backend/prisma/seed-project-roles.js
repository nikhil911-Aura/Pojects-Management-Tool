/**
 * Data migration: creates the 3 system roles per WORKSPACE and migrates
 * ProjectMember.projectRole enum → projectRoleId FK.
 *
 * Run with: node --experimental-modules prisma/seed-project-roles.js
 * Safe to re-run — skips workspaces that already have system roles.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALL_PERMS = {
  'task.create': true, 'task.edit': true, 'task.delete': true, 'task.move': true,
  'task.assign': true, 'task.complete': true,
  'subtask.create': true, 'subtask.delete': true,
  'section.create': true, 'section.edit': true, 'section.delete': true,
  'field.create': true, 'field.delete': true, 'field.edit': true,
  'comment.create': true, 'comment.delete': true,
  'project.edit': true, 'project.delete': true, 'project.invite': true,
  'attachment.add': true, 'attachment.delete': true,
  'time.track': true,
};

const COMMENTER_PERMS = { 'comment.create': true, 'comment.delete': true, 'time.track': true };
const VIEWER_PERMS = {};

const SYSTEM_ROLES = [
  { name: 'Editor',    color: '#3B82F6', permissions: ALL_PERMS,       position: 0 },
  { name: 'Commenter', color: '#F59E0B', permissions: COMMENTER_PERMS, position: 1 },
  { name: 'Viewer',    color: '#6B7280', permissions: VIEWER_PERMS,    position: 2 },
];

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  console.log(`Found ${workspaces.length} workspaces. Seeding system roles...`);

  for (const ws of workspaces) {
    const roleMap = {};
    for (const sr of SYSTEM_ROLES) {
      const existing = await prisma.customProjectRole.findUnique({
        where: { workspaceId_name: { workspaceId: ws.id, name: sr.name } },
      });
      if (existing) {
        roleMap[sr.name] = existing.id;
        continue;
      }
      const created = await prisma.customProjectRole.create({
        data: { name: sr.name, color: sr.color, isSystem: true, permissions: sr.permissions, position: sr.position, workspaceId: ws.id },
      });
      roleMap[sr.name] = created.id;
      console.log(`  [${ws.name}] Created system role: ${sr.name}`);
    }

    // Migrate members in this workspace's projects
    const projects = await prisma.project.findMany({ where: { workspaceId: ws.id }, select: { id: true } });
    for (const project of projects) {
      const members = await prisma.projectMember.findMany({
        where: { projectId: project.id, projectRoleId: null },
      });
      for (const m of members) {
        let targetRoleId;
        switch (m.projectRole) {
          case 'EDITOR':    targetRoleId = roleMap['Editor'];    break;
          case 'COMMENTER': targetRoleId = roleMap['Commenter']; break;
          case 'VIEWER':    targetRoleId = roleMap['Viewer'];    break;
          default:          targetRoleId = roleMap['Viewer'];
        }
        await prisma.projectMember.update({ where: { id: m.id }, data: { projectRoleId: targetRoleId } });
      }
      if (members.length > 0) console.log(`  [${ws.name}/${project.id}] Migrated ${members.length} members`);
    }
  }
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
