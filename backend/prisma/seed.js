import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const hash = (pw) => bcrypt.hashSync(pw, 10);

async function main() {
  console.log('🌱 Seeding RBAC test data...\n');

  // ── Clean up ──────────────────────────────────────────────────────────────
  await prisma.activityLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.list.deleteMany();
  await prisma.board.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspaceInvite.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ─────────────────────────────────────────────────────────────────
  // alice  — workspace OWNER   → auto-Editor in all projects
  // bob    — workspace ADMIN   → auto-Editor in all projects
  // carol  — workspace MEMBER  → project role varies per project
  // dave   — workspace MEMBER  → project role varies per project
  // eve    — workspace GUEST   → can ONLY see projects she's explicitly added to

  const alice = await prisma.user.create({
    data: { name: 'Alice Johnson', email: 'alice@demo.com', password: hash('password123') },
  });
  const bob = await prisma.user.create({
    data: { name: 'Bob Martinez', email: 'bob@demo.com', password: hash('password123') },
  });
  const carol = await prisma.user.create({
    data: { name: 'Carol Chen', email: 'carol@demo.com', password: hash('password123') },
  });
  const dave = await prisma.user.create({
    data: { name: 'Dave Wilson', email: 'dave@demo.com', password: hash('password123') },
  });
  const eve = await prisma.user.create({
    data: { name: 'Eve Taylor', email: 'eve@demo.com', password: hash('password123') },
  });

  console.log('✅ Users created');

  // ── Workspace ─────────────────────────────────────────────────────────────
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme Inc.',
      description: 'RBAC test workspace — each user has a different workspace role',
      members: {
        create: [
          { userId: alice.id, role: 'OWNER',  status: 'ACTIVE', joinedAt: new Date() },
          { userId: bob.id,   role: 'ADMIN',  status: 'ACTIVE', joinedAt: new Date() },
          { userId: carol.id, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
          { userId: dave.id,  role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
          { userId: eve.id,   role: 'GUEST',  status: 'ACTIVE', joinedAt: new Date() },
        ],
      },
    },
  });

  console.log('✅ Workspace "Acme Inc." created');

  // ── Helper: create a board + lists + tasks under a project ────────────────
  async function seedBoard(projectId, listDefs) {
    const board = await prisma.board.create({
      data: { name: 'Board', projectId },
    });

    for (let li = 0; li < listDefs.length; li++) {
      const { name: listName, tasks } = listDefs[li];
      const list = await prisma.list.create({
        data: { name: listName, position: li, boardId: board.id },
      });

      for (let ti = 0; ti < tasks.length; ti++) {
        const t = tasks[ti];
        const task = await prisma.task.create({
          data: {
            title: t.title,
            description: t.description || null,
            status:   t.status   || 'TODO',
            priority: t.priority || 'MEDIUM',
            dueDate:  t.dueDate  ? new Date(t.dueDate) : null,
            position: ti,
            listId: list.id,
          },
        });

        // Creator activity log
        const creatorId = t.createdBy || alice.id;
        await prisma.activityLog.create({
          data: { action: 'TASK_CREATED', taskId: task.id, userId: creatorId },
        });

        if (t.assignees) {
          for (const uid of t.assignees) {
            await prisma.taskAssignee.create({ data: { taskId: task.id, userId: uid } });
          }
        }

        if (t.comments) {
          for (const c of t.comments) {
            await prisma.comment.create({
              data: { content: c.content, taskId: task.id, userId: c.userId },
            });
            await prisma.activityLog.create({
              data: { action: 'COMMENT_ADDED', taskId: task.id, userId: c.userId },
            });
          }
        }

        if (t.subtasks) {
          for (let si = 0; si < t.subtasks.length; si++) {
            const st = t.subtasks[si];
            const sub = await prisma.task.create({
              data: {
                title: st.title, status: st.status || 'TODO',
                priority: 'LOW', position: si,
                listId: list.id, parentId: task.id,
              },
            });
            await prisma.activityLog.create({
              data: { action: 'SUBTASK_CREATED', taskId: sub.id, userId: creatorId },
            });
          }
        }
      }
    }

    return board;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 1 — "Design System"  (PUBLIC)
  //
  // Who can access?
  //   Alice (Owner)  → auto-EDITOR  (bypasses project role)
  //   Bob (Admin)    → auto-EDITOR  (bypasses project role)
  //   Carol (Member) → EDITOR       (can create/edit/delete tasks, comment)
  //   Dave (Member)  → COMMENTER    (can view + comment, CANNOT edit tasks)
  //   Eve (Guest)    → NOT ADDED    (Guests cannot see PUBLIC projects either)
  // ══════════════════════════════════════════════════════════════════════════
  const p1 = await prisma.project.create({
    data: {
      name: 'Design System',
      description: 'Centralized component library and design tokens for consistent UI across all products.',
      icon: '#4573D2',
      visibility: 'PUBLIC',
      workspaceId: workspace.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { userId: carol.id, projectId: p1.id, projectRole: 'EDITOR' },
      { userId: dave.id,  projectId: p1.id, projectRole: 'COMMENTER' },
    ],
  });

  await seedBoard(p1.id, [
    {
      name: 'To Do',
      tasks: [
        {
          title: 'Define color token naming convention',
          description: 'Establish a scalable naming convention for color tokens — primary, semantic, and contextual.',
          priority: 'HIGH',
          assignees: [carol.id],
          createdBy: alice.id,
          comments: [
            { content: 'I think we should follow the Material Design approach — primary, on-primary, surface, on-surface, etc.', userId: carol.id },
            { content: 'Agreed, that pattern works well. Also consider adding semantic tokens like "success", "warning", "error".', userId: dave.id },
          ],
        },
        {
          title: 'Build button component variants',
          description: 'Primary, secondary, destructive, ghost, and link variants.',
          priority: 'HIGH',
          status: 'TODO',
          dueDate: '2026-04-15',
          assignees: [carol.id],
          createdBy: carol.id,
          subtasks: [
            { title: 'Primary button' },
            { title: 'Secondary button' },
            { title: 'Destructive button' },
            { title: 'Ghost / link button' },
          ],
        },
        {
          title: 'Document typography scale',
          description: 'H1–H6, body, caption, and code font sizes and line heights.',
          priority: 'MEDIUM',
          assignees: [dave.id],
          createdBy: alice.id,
          comments: [
            { content: 'Reviewed the type scale — looks consistent across breakpoints. Nice work.', userId: dave.id },
          ],
        },
      ],
    },
    {
      name: 'In Progress',
      tasks: [
        {
          title: 'Spacing & layout grid system',
          description: '4px base grid, 8-column layout, breakpoints for sm/md/lg/xl.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: '2026-04-10',
          assignees: [carol.id, alice.id],
          createdBy: alice.id,
          comments: [
            { content: 'Updated the spacing scale to match the new grid system. Let me know if anything looks off.', userId: alice.id },
            { content: 'Carol (Editor): Grid base is done. Working on the breakpoint tokens.', userId: carol.id },
            { content: 'Dave (Commenter): Grid looks great! LGTM — but I cannot edit the task status myself.', userId: dave.id },
          ],
          subtasks: [
            { title: '4px base unit defined', status: 'DONE' },
            { title: 'Spacing scale (4, 8, 12, 16, 24, 32, 48, 64px)', status: 'DONE' },
            { title: 'Breakpoint tokens' },
            { title: 'Layout grid documentation' },
          ],
        },
        {
          title: 'Icon library — first 50 icons',
          description: 'SVG icon set exported from Figma, optimised with SVGO.',
          priority: 'MEDIUM',
          status: 'IN_PROGRESS',
          dueDate: '2026-04-12',
          assignees: [dave.id],
          createdBy: alice.id,
          comments: [
            { content: 'Dave (Commenter): 32 of 50 icons are exported. On track.', userId: dave.id },
          ],
        },
      ],
    },
    {
      name: 'Done',
      tasks: [
        {
          title: 'Figma design system file set up',
          description: 'Shared Figma file with pages for Foundations, Components, and Documentation.',
          priority: 'HIGH',
          status: 'DONE',
          assignees: [alice.id],
          createdBy: alice.id,
          comments: [
            { content: 'File is live and shared with the whole team.', userId: alice.id },
          ],
        },
      ],
    },
  ]);

  console.log('✅ Project 1: "Design System" (PUBLIC | Carol=EDITOR, Dave=COMMENTER, Eve=NOT ADDED)');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 2 — "Sales Pipeline"  (PRIVATE)
  //
  // Who can access?
  //   Alice (Owner)  → auto-EDITOR  (bypasses project role)
  //   Bob (Admin)    → auto-EDITOR  (bypasses project role)
  //   Carol (Member) → VIEWER       (read-only — CANNOT comment or edit)
  //   Dave (Member)  → NOT ADDED    (PRIVATE project, no membership → no access)
  //   Eve (Guest)    → COMMENTER    (Guest but explicitly added; can view + comment)
  // ══════════════════════════════════════════════════════════════════════════
  const p2 = await prisma.project.create({
    data: {
      name: 'Sales Pipeline',
      description: 'Track and manage the full sales funnel from prospecting to close.',
      icon: '#FC636B',
      visibility: 'PRIVATE',
      workspaceId: workspace.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { userId: carol.id, projectId: p2.id, projectRole: 'VIEWER' },
      { userId: eve.id,   projectId: p2.id, projectRole: 'COMMENTER' },
    ],
  });

  await seedBoard(p2.id, [
    {
      name: 'Prospecting',
      tasks: [
        {
          title: 'Research Acme Corp — Q2 expansion opportunity',
          description: 'Acme Corp is evaluating expansion — $120K ARR opportunity for Q2.',
          priority: 'HIGH',
          assignees: [alice.id],
          createdBy: alice.id,
          comments: [
            { content: 'Deal size looks like $120K ARR. Meeting with their VP of Engineering next week.', userId: alice.id },
            { content: 'I spoke to their procurement team last week — they are actively evaluating.', userId: eve.id },
          ],
        },
        {
          title: 'Cold outreach — TechStartup Inc.',
          description: '50-person Series A startup. Warm intro from Bob\'s network.',
          priority: 'MEDIUM',
          status: 'TODO',
          assignees: [bob.id],
          createdBy: alice.id,
          comments: [
            { content: 'I have the intro lined up for next Tuesday.', userId: bob.id },
            { content: 'Their CTO follows us on LinkedIn — good signal.', userId: eve.id },
          ],
        },
      ],
    },
    {
      name: 'Qualified',
      tasks: [
        {
          title: 'GlobalCorp — demo scheduled for April 5',
          description: 'Enterprise deal. Budget confirmed at $80K. Decision maker: VP of Engineering.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: '2026-04-05',
          assignees: [alice.id, bob.id],
          createdBy: alice.id,
          subtasks: [
            { title: 'Prepare custom demo environment', status: 'DONE' },
            { title: 'Review their security questionnaire' },
            { title: 'Prepare pricing proposal' },
          ],
          comments: [
            { content: 'Alice: Demo prep is on track. Custom workspace is ready.', userId: alice.id },
            { content: 'Eve (Commenter/Guest): I know their IT manager — happy to make an intro.', userId: eve.id },
          ],
        },
        {
          title: 'RegionalBank — POC running',
          description: '90-day proof of concept in their innovation team (15 users).',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: '2026-04-20',
          assignees: [bob.id],
          createdBy: alice.id,
          comments: [
            { content: 'Bob: POC is going well. NPS from pilot users: 72.', userId: bob.id },
          ],
        },
      ],
    },
    {
      name: 'Closed Won',
      tasks: [
        {
          title: 'MegaCorp — $240K deal CLOSED',
          description: '3-year enterprise contract. 500 seats.',
          priority: 'HIGH',
          status: 'DONE',
          assignees: [alice.id],
          createdBy: alice.id,
          comments: [
            { content: '🎉 Contract signed! Onboarding call scheduled for April 1.', userId: alice.id },
            { content: 'Eve (Commenter): Congrats team! Huge win.', userId: eve.id },
          ],
        },
      ],
    },
  ]);

  console.log('✅ Project 2: "Sales Pipeline" (PRIVATE | Carol=VIEWER, Dave=NO ACCESS, Eve=COMMENTER)');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 3 — "Engineering Roadmap"  (PUBLIC)
  //
  // Who can access?
  //   Alice (Owner)  → auto-EDITOR  (bypasses project role)
  //   Bob (Admin)    → auto-EDITOR  (bypasses project role)
  //   Carol (Member) → COMMENTER    (can view + comment, CANNOT edit tasks)
  //   Dave (Member)  → EDITOR       (full access — create/edit/delete/comment)
  //   Eve (Guest)    → NOT ADDED    (Guests cannot see PUBLIC projects)
  // ══════════════════════════════════════════════════════════════════════════
  const p3 = await prisma.project.create({
    data: {
      name: 'Engineering Roadmap',
      description: 'Engineering milestones, technical debt, and infrastructure improvements for Q2-Q3.',
      icon: '#37A169',
      visibility: 'PUBLIC',
      workspaceId: workspace.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { userId: carol.id, projectId: p3.id, projectRole: 'COMMENTER' },
      { userId: dave.id,  projectId: p3.id, projectRole: 'EDITOR' },
    ],
  });

  await seedBoard(p3.id, [
    {
      name: 'Q2 Milestones',
      tasks: [
        {
          title: 'Launch v2.0 API',
          description: 'New auth, rate limiting, OpenAPI docs, and SDK updates for all platforms.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: '2026-04-30',
          assignees: [dave.id],
          createdBy: dave.id,
          comments: [
            { content: 'Dave (Editor): Auth endpoints are done. Rate limiting WIP.', userId: dave.id },
            { content: 'Carol (Commenter): Looks solid. Will the v1 API be deprecated with this release?', userId: carol.id },
            { content: 'Yes — 6 month deprecation window starting April 30.', userId: alice.id },
          ],
          subtasks: [
            { title: 'Auth endpoints', status: 'DONE' },
            { title: 'Rate limiting middleware', status: 'IN_PROGRESS' },
            { title: 'OpenAPI docs generation' },
            { title: 'SDK updates (JS, Python)' },
          ],
        },
        {
          title: 'Database performance audit',
          description: 'Profile slow queries and add missing indexes.',
          priority: 'MEDIUM',
          status: 'TODO',
          assignees: [dave.id],
          createdBy: dave.id,
          comments: [
            { content: 'Carol (Commenter): Can we prioritise this? The workspace query is visibly slow for large orgs.', userId: carol.id },
            { content: 'Dave (Editor): Agreed — moving this up in the priority order.', userId: dave.id },
          ],
        },
        {
          title: '[EDITOR test] Implement webhook system',
          description: 'Analyze slow queries, optimize indexes, and benchmark read/write performance.',
          priority: 'HIGH',
          status: 'TODO',
          dueDate: '2026-05-15',
          assignees: [dave.id],
          createdBy: dave.id,
          comments: [
            { content: 'Carol (Commenter): Love this feature — customers have been asking for it!', userId: carol.id },
          ],
          subtasks: [
            { title: 'Webhook endpoint registration' },
            { title: 'Payload signing (HMAC)' },
            { title: 'Retry logic with exponential backoff' },
            { title: 'Delivery logs UI' },
          ],
        },
      ],
    },
    {
      name: 'Q3 Backlog',
      tasks: [
        {
          title: 'GraphQL API layer',
          description: 'Add GraphQL alongside REST for flexible client queries.',
          priority: 'MEDIUM',
          status: 'TODO',
          assignees: [alice.id],
          createdBy: alice.id,
        },
        {
          title: 'Multi-region deployment',
          description: 'EU and APAC regions for data residency compliance.',
          priority: 'HIGH',
          status: 'TODO',
          assignees: [dave.id],
          createdBy: alice.id,
          comments: [
            { content: 'Carol (Commenter): Several EU enterprise prospects need this.', userId: carol.id },
          ],
        },
      ],
    },
    {
      name: 'Done',
      tasks: [
        {
          title: 'Migrate to Node.js 22 LTS',
          description: 'Upgrade all services to Node.js 22 LTS and update CI.',
          priority: 'MEDIUM',
          status: 'DONE',
          assignees: [dave.id],
          createdBy: dave.id,
          comments: [
            { content: 'Done. P95 API latency dropped by ~12ms.', userId: dave.id },
          ],
        },
      ],
    },
  ]);

  console.log('✅ Project 3: "Engineering Roadmap" (PUBLIC | Carol=COMMENTER, Dave=EDITOR, Eve=NOT ADDED)');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 4 — "Executive Strategy"  (PRIVATE)
  //
  // Who can access?
  //   Alice (Owner)  → auto-EDITOR  (bypasses project role)
  //   Bob (Admin)    → auto-EDITOR  (bypasses project role)
  //   Carol (Member) → NOT ADDED    (PRIVATE + no membership → zero access)
  //   Dave (Member)  → NOT ADDED    (PRIVATE + no membership → zero access)
  //   Eve (Guest)    → VIEWER       (Guest + explicitly added; can only VIEW — no comment, no edit)
  // ══════════════════════════════════════════════════════════════════════════
  const p4 = await prisma.project.create({
    data: {
      name: 'Executive Strategy',
      description: 'High-level company strategy, fundraising, and leadership decisions.',
      icon: '#6A67CE',
      visibility: 'PRIVATE',
      workspaceId: workspace.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { userId: eve.id, projectId: p4.id, projectRole: 'VIEWER' },
    ],
  });

  await seedBoard(p4.id, [
    {
      name: 'Q3 Initiatives',
      tasks: [
        {
          title: 'Series B fundraising prep',
          description: 'Prepare pitch deck, data room, and outreach plan for Series B round.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          dueDate: '2026-06-30',
          assignees: [alice.id, bob.id],
          createdBy: alice.id,
          comments: [
            { content: 'Alice: Deck v3 sent to lead investor. Awaiting term sheet.', userId: alice.id },
            { content: 'Data room is ready. Due diligence started.', userId: bob.id },
          ],
          subtasks: [
            { title: 'Finalize pitch deck', status: 'DONE' },
            { title: 'Build data room', status: 'DONE' },
            { title: 'Investor outreach (target: 20 VCs)', status: 'IN_PROGRESS' },
            { title: 'Term sheet negotiation' },
            { title: 'Legal review and close' },
          ],
        },
        {
          title: 'M&A target evaluation — CompetitorX',
          description: 'Confidential. Explore acquisition of CompetitorX for their IP and customer base.',
          priority: 'HIGH',
          status: 'TODO',
          assignees: [alice.id],
          createdBy: alice.id,
          comments: [
            { content: 'Alice: Initial valuation puts them at $8–12M. Team has 12 engineers.', userId: alice.id },
            { content: 'Bob: Their churn rate is concerning — 18% annually. Worth factoring into the price.', userId: bob.id },
          ],
        },
        {
          title: 'Board meeting prep — June quarterly',
          description: 'Prepare financial review, OKR progress, and headcount plan for board deck.',
          priority: 'HIGH',
          status: 'TODO',
          dueDate: '2026-06-15',
          assignees: [alice.id, bob.id],
          createdBy: alice.id,
          subtasks: [
            { title: 'Revenue and ARR slide' },
            { title: 'OKR scorecard' },
            { title: 'Headcount and burn plan' },
            { title: 'Product roadmap highlights' },
          ],
        },
      ],
    },
    {
      name: 'Completed',
      tasks: [
        {
          title: 'Annual strategic planning session',
          description: '2-day offsite to set company OKRs and define the 3-year vision.',
          priority: 'HIGH',
          status: 'DONE',
          assignees: [alice.id, bob.id],
          createdBy: alice.id,
          comments: [
            { content: 'Offsite was a success. OKRs finalized and shared with all team leads.', userId: alice.id },
          ],
        },
      ],
    },
  ]);

  console.log('✅ Project 4: "Executive Strategy" (PRIVATE | Carol=NO ACCESS, Dave=NO ACCESS, Eve=VIEWER)');

  // ── Summary ────────────────────────────────────────────────────────────────
  const taskCount    = await prisma.task.count();
  const commentCount = await prisma.comment.count();

  console.log('\n' + '═'.repeat(70));
  console.log('🎉 RBAC seed complete!');
  console.log('═'.repeat(70));
  console.log(`Tasks: ${taskCount}  |  Comments: ${commentCount}`);
  console.log('');
  console.log('📧 LOGIN CREDENTIALS (all passwords: password123)');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('  alice@demo.com  →  Alice Johnson  — Workspace OWNER');
  console.log('  bob@demo.com    →  Bob Martinez   — Workspace ADMIN');
  console.log('  carol@demo.com  →  Carol Chen     — Workspace MEMBER');
  console.log('  dave@demo.com   →  Dave Wilson    — Workspace MEMBER');
  console.log('  eve@demo.com    →  Eve Taylor     — Workspace GUEST');
  console.log('');
  console.log('🔑 WHAT EACH USER CAN DO PER PROJECT');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('  PROJECT                  ALICE  BOB    CAROL          DAVE           EVE');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  Design System (PUBLIC)   EDIT   EDIT   EDIT (Editor)  COMMENT only   NO ACCESS');
  console.log('  Sales Pipeline (PRIVATE) EDIT   EDIT   VIEW only      NO ACCESS      COMMENT (Guest+Commenter)');
  console.log('  Eng Roadmap (PUBLIC)     EDIT   EDIT   COMMENT only   EDIT (Editor)  NO ACCESS');
  console.log('  Exec Strategy (PRIVATE)  EDIT   EDIT   NO ACCESS      NO ACCESS      VIEW only (Guest+Viewer)');
  console.log('═'.repeat(70));
}

main()
  .catch((e) => { console.error('\n❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
