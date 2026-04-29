import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';
import emailService from '../email/emailService.js';
import ExcelJS from 'exceljs';

function isWorkspaceAdmin(role) {
  return role === 'OWNER' || role === 'ADMIN';
}

// ── Date filter helper ──────────────────────────────────────────────────────
// Supports either an explicit startDate/endDate range or a `period` keyword.
function parseDateFilter(filters) {
  const now = new Date();
  let startDate = filters.startDate ? new Date(filters.startDate) : null;
  let endDate = filters.endDate ? new Date(filters.endDate) : null;

  if (!startDate && !endDate && filters.period) {
    switch (filters.period) {
      case 'today': {
        startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'yesterday': {
        const y = new Date(now); y.setDate(now.getDate() - 1);
        startDate = new Date(y); startDate.setHours(0, 0, 0, 0);
        endDate = new Date(y); endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'week': {
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'last_week': {
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'last_month': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      }
    }
  }

  // Inclusive end-of-day if user passed a plain date string
  if (endDate && filters.endDate) endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}

// ── Build the WHERE clause used by every report query ───────────────────────
// Always scopes to a workspace and to COMPLETED tasks (status = DONE).
// `assigneeUserId` (when provided) further restricts to tasks where that user
// is an assignee — used by My Timesheet so users only see their OWN work,
// not time they happened to log on someone else's task.
function buildWhereClause({ workspaceId, userId = null, filters = {}, assigneeUserId = null }) {
  const { startDate, endDate } = parseDateFilter(filters);

  const where = {
    task: {
      status: 'DONE',                                          // ← keep: only completed tasks
      list: { board: { project: { workspaceId } } },
    },
  };

  if (userId) where.userId = userId;

  if (assigneeUserId) {
    where.task.assignees = { some: { userId: assigneeUserId } };
  }

  if (filters.userIds?.length) {
    where.userId = { in: filters.userIds };
  }

  if (filters.projectIds?.length) {
    where.task.list = {
      board: { project: { workspaceId, id: { in: filters.projectIds } } }
    };
  }

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = startDate;
    if (endDate) where.date.lte = endDate;
  }

  return where;
}

// Standard include used everywhere — task + project + user
const STANDARD_INCLUDE = {
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      estimatedTime: true,
      actualTime: true,
      list: {
        select: {
          name: true,
          board: {
            select: {
              project: { select: { id: true, name: true, color: true } }
            }
          }
        }
      }
    }
  },
  user: { select: { id: true, name: true, email: true, avatar: true } }
};

// ── Service ─────────────────────────────────────────────────────────────────

export const reportService = {

  // My timesheet — completed tasks where the user is the PRIMARY assignee.
  // Uses Task.actualTime (the recomputed total) so it always reflects what's
  // shown on the task, regardless of who logged the time entries.
  async getMyTimesheet(userId, workspaceId, filters = {}) {
    const membership = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const { startDate, endDate } = parseDateFilter(filters);

    // Task-level filter: scoped to workspace, user is an assignee (any status)
    const taskWhere = {
      list: { board: { project: { workspaceId } } },
      assignees: { some: { userId } },
    };

    if (filters.projectIds?.length) {
      taskWhere.list = { board: { project: { workspaceId, id: { in: filters.projectIds } } } };
    }

    // Date filter — uses the task's updatedAt as a proxy for completion date
    if (startDate || endDate) {
      taskWhere.updatedAt = {};
      if (startDate) taskWhere.updatedAt.gte = startDate;
      if (endDate) taskWhere.updatedAt.lte = endDate;
    }

    const tasks = await prisma.task.findMany({
      where: taskWhere,
      include: {
        list: {
          select: {
            name: true,
            board: {
              select: {
                project: { select: { id: true, name: true, color: true } }
              }
            }
          }
        },
        assignees: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
        timeEntries: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Keep only tasks where the current user is the PRIMARY (first) assignee
    const filtered = tasks.filter(t => t.assignees?.[0]?.userId === userId);

    return groupTasksByProject(filtered);
  },

  // Team report — admin/owner or users with report.viewTeam custom role permission
  async getTeamReport(workspaceId, userId, filters = {}) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
      include: { customRole: { select: { permissions: true } } },
    });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const hasCustomPermission = !!(
      membership.customRole?.permissions &&
      typeof membership.customRole.permissions === 'object' &&
      membership.customRole.permissions['report.viewTeam']
    );

    if (!isWorkspaceAdmin(membership.role) && !hasCustomPermission) {
      throw ApiError.forbidden('You do not have permission to view team reports');
    }

    const where = buildWhereClause({ workspaceId, filters });

    const entries = await prisma.timeEntry.findMany({
      where,
      include: STANDARD_INCLUDE,
      orderBy: { date: 'desc' },
    });

    const groupBy = filters.groupBy || 'person_project';
    if (groupBy === 'project') return groupByProjectTeam(entries);
    if (groupBy === 'person') return groupByPerson(entries);
    return groupByPersonProject(entries);
  },

  // Summary cards — task-based (uses Task.actualTime) so numbers match My Timesheet
  async getReportSummary(workspaceId, userId, filters = {}) {
    const membership = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const isAdmin = isWorkspaceAdmin(membership.role);
    const { startDate, endDate } = parseDateFilter(filters);

    const taskWhere = {
      list: { board: { project: { workspaceId } } },
    };
    if (filters.projectIds?.length) {
      taskWhere.list = { board: { project: { workspaceId, id: { in: filters.projectIds } } } };
    }
    if (!isAdmin) {
      taskWhere.assignees = { some: { userId } };
    }
    if (filters.userIds?.length) {
      taskWhere.assignees = { some: { userId: { in: filters.userIds } } };
    }
    if (startDate || endDate) {
      taskWhere.updatedAt = {};
      if (startDate) taskWhere.updatedAt.gte = startDate;
      if (endDate) taskWhere.updatedAt.lte = endDate;
    }

    const tasks = await prisma.task.findMany({
      where: taskWhere,
      include: {
        list: { select: { board: { select: { project: { select: { id: true, name: true } } } } } },
        assignees: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // For non-admins, keep only tasks where THEY are the primary assignee
    const filteredTasks = !isAdmin
      ? tasks.filter(t => t.assignees?.[0]?.userId === userId)
      : tasks;

    let totalMinutes = 0;
    const projectMinutes = {};
    const memberMinutes = {};

    for (const t of filteredTasks) {
      const project = t.list.board.project;
      const mins = t.actualTime || 0;
      totalMinutes += mins;

      if (!projectMinutes[project.id]) projectMinutes[project.id] = { name: project.name, minutes: 0, taskIds: new Set() };
      projectMinutes[project.id].minutes += mins;
      projectMinutes[project.id].taskIds.add(t.id);

      // Attribute time to the PRIMARY assignee (for team breakdown)
      const primary = t.assignees?.[0]?.user;
      if (primary) {
        if (!memberMinutes[primary.id]) memberMinutes[primary.id] = { user: primary, minutes: 0, taskIds: new Set() };
        memberMinutes[primary.id].minutes += mins;
        memberMinutes[primary.id].taskIds.add(t.id);
      }
    }

    const hoursPerProject = Object.entries(projectMinutes)
      .map(([id, p]) => ({ projectId: id, projectName: p.name, totalHours: +(p.minutes / 60).toFixed(2), taskCount: p.taskIds.size }))
      .sort((a, b) => b.totalHours - a.totalHours);

    const hoursPerMember = Object.values(memberMinutes)
      .map(m => ({ userId: m.user.id, userName: m.user.name, avatar: m.user.avatar, totalHours: +(m.minutes / 60).toFixed(2), taskCount: m.taskIds.size }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // Completion rate respects the same filters (project + workspace + date scope on tasks)
    const completionRate = await calculateCompletionRate(workspaceId, filters, isAdmin ? null : userId);

    return {
      totalHours: +(totalMinutes / 60).toFixed(2),
      totalEntries: filteredTasks.length,  // now counts completed tasks, not time entries
      hoursPerProject,
      hoursPerMember,
      topContributor: hoursPerMember[0] || null,
      mostActiveProject: hoursPerProject[0] || null,
      completionRate,
    };
  },

  // CSV / JSON export of the user's (or team, for admins) timesheet
  async exportReport(workspaceId, userId, filters = {}, format = 'csv') {
    const membership = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    const isAdmin = isWorkspaceAdmin(membership.role);
    // Admins can export team data; regular users only their own (assignee-restricted)
    const includeAllUsers = isAdmin && (filters.scope === 'team' || filters.userIds?.length);
    const where = buildWhereClause({
      workspaceId,
      userId: includeAllUsers ? null : userId,
      assigneeUserId: includeAllUsers ? null : userId,
      filters,
    });

    const entries = await prisma.timeEntry.findMany({
      where,
      include: STANDARD_INCLUDE,
      orderBy: { date: 'desc' },
    });

    const rows = entries.map(e => ({
      date: e.date.toISOString().split('T')[0],
      person: e.user.name,
      project: e.task.list.board.project.name,
      section: e.task.list.name,
      task: e.task.title,
      status: e.task.status,
      priority: e.task.priority || '',
      dueDate: e.task.dueDate ? new Date(e.task.dueDate).toISOString().split('T')[0] : '',
      minutes: e.minutes,
      hours: +(e.minutes / 60).toFixed(2),
      note: e.note || '',
    }));

    // Aggregate per unique task → total time across all entries
    const taskTotalsMap = {};
    for (const e of entries) {
      const tid = e.task.id;
      if (!taskTotalsMap[tid]) {
        taskTotalsMap[tid] = {
          taskId: tid,
          task: e.task.title,
          project: e.task.list.board.project.name,
          section: e.task.list.name,
          status: e.task.status,
          priority: e.task.priority || '',
          dueDate: e.task.dueDate ? new Date(e.task.dueDate).toISOString().split('T')[0] : '',
          assignees: '',
          minutes: 0,
          entries: 0,
        };
      }
      taskTotalsMap[tid].minutes += e.minutes;
      taskTotalsMap[tid].entries += 1;
    }
    const taskTotals = Object.values(taskTotalsMap)
      .map(t => ({ ...t, hours: +(t.minutes / 60).toFixed(2) }))
      .sort((a, b) => b.minutes - a.minutes);

    if (format === 'json') return { rows, taskTotals };

    if (format === 'xlsx') {
      const summary = await this.getReportSummary(workspaceId, userId, filters);
      return buildExcelWorkbook({ rows, taskTotals, filters, summary, isAdmin, includeAllUsers });
    }

    // CSV (legacy)
    if (rows.length === 0) {
      return 'Date,Person,Project,Section,Task,Status,Priority,Due Date,Minutes,Hours,Note\n';
    }
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.map(h => h.charAt(0).toUpperCase() + h.slice(1).replace(/([A-Z])/g, ' $1').trim()).join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ];
    return csvLines.join('\n');
  },

  // Send report via email — supports workspace members AND custom email addresses.
  // Sender must be a workspace member; max 20 recipients per send to prevent spam.
  async emailReport(workspaceId, userId, filters = {}, recipients = [], options = {}) {
    const membership = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!membership) throw ApiError.forbidden('You are not a member of this workspace');

    // Normalize + de-dupe recipient list
    const cleaned = Array.from(new Set(
      recipients.map(r => String(r || '').trim().toLowerCase()).filter(Boolean)
    ));

    if (!cleaned.length) throw ApiError.badRequest('At least one recipient is required');
    if (cleaned.length > 20) throw ApiError.badRequest('Too many recipients (max 20 per send)');

    // Basic email format validation
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidFormat = cleaned.filter(e => !emailRe.test(e));
    if (invalidFormat.length) {
      throw ApiError.badRequest(`Invalid email format: ${invalidFormat.join(', ')}`);
    }

    // Fetch sender details + workspace members for context (used in HTML and audit log)
    const workspaceUsers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    const sender = workspaceUsers.find(m => m.userId === userId)?.user;
    const memberEmails = new Set(workspaceUsers.map(m => m.user.email.toLowerCase()));

    const isAdmin = isWorkspaceAdmin(membership.role);

    // Build report data — admins email team report, others email their own
    const reportData = isAdmin
      ? await this.getTeamReport(workspaceId, userId, { ...filters, groupBy: filters.groupBy || 'person_project' })
      : await this.getMyTimesheet(userId, workspaceId, filters);

    const summary = await this.getReportSummary(workspaceId, userId, filters);

    // Aggregate task totals (one row per unique task across all groups)
    // — used for the "Tasks & Time" section in the email so recipients see
    // a clean task → time list at a glance.
    const taskTotalsMap = {};
    for (const g of (reportData?.groups || [])) {
      for (const t of (g.tasks || [])) {
        if (!taskTotalsMap[t.id]) {
          taskTotalsMap[t.id] = {
            id: t.id,
            title: t.title,
            status: t.status,
            project: g.project?.name || t.projectName || '',
            projectColor: g.project?.color || t.projectColor || '#4573D2',
            section: t.section,
            minutes: 0,
          };
        }
        taskTotalsMap[t.id].minutes += t.totalMinutes || 0;
      }
    }
    const taskTotals = Object.values(taskTotalsMap).sort((a, b) => b.minutes - a.minutes);

    // Personal note from sender
    const personalMessage = (options.message || '').trim().slice(0, 1000);

    const html = renderReportEmailHtml({
      isAdmin,
      filters,
      taskTotals,
      summary,
      reportData,
      sender,
      workspaceName: workspaceUsers[0] ? '' : '', // placeholder; set below
      personalMessage,
    });

    // Get workspace name for the subject line + greeting
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    const subject = `${isAdmin && (filters.scope === 'team' || filters.userIds?.length) ? 'Team' : 'Work'} Report — ${formatDateRange(filters)}`;

    // Send each email — mark non-workspace recipients in logs for auditing
    const sendPromises = cleaned.map(to => {
      const isExternal = !memberEmails.has(to);
      return emailService.sendReportEmail(to, subject, html).then(() => ({ to, isExternal, ok: true }))
        .catch(err => ({ to, isExternal, ok: false, error: err.message }));
    });
    const results = await Promise.all(sendPromises);

    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    const externalCount = results.filter(r => r.isExternal && r.ok).length;

    return {
      sent,
      total: cleaned.length,
      external: externalCount,
      failed: failed.map(f => ({ to: f.to, error: f.error })),
    };
  },
};

// ── Excel workbook builder ──────────────────────────────────────────────────
async function buildExcelWorkbook({ rows, taskTotals = [], filters, summary, isAdmin, includeAllUsers }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Asana Clone';
  wb.created = new Date();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────
  const summarySheet = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: 'FF4573D2' } },
  });

  // Title row
  summarySheet.mergeCells('A1:D1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = isAdmin && includeAllUsers ? 'Team Work Report' : 'Work Report';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  summarySheet.getRow(1).height = 30;

  // Date range row
  summarySheet.mergeCells('A2:D2');
  const dateCell = summarySheet.getCell('A2');
  dateCell.value = `Period: ${formatDateRange(filters)}`;
  dateCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };
  summarySheet.getRow(2).height = 20;

  summarySheet.addRow([]);

  // KPI table
  const kpiHeader = summarySheet.addRow(['Metric', 'Value']);
  kpiHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  kpiHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4573D2' } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
  });
  kpiHeader.height = 22;

  const kpis = [
    ['Total Hours', `${(summary?.totalHours || 0).toFixed(2)}h`],
    ['Total Time Entries', summary?.totalEntries || 0],
    ['Completion Rate', `${summary?.completionRate?.rate || 0}% (${summary?.completionRate?.completed || 0} / ${summary?.completionRate?.total || 0})`],
    ['Top Contributor', summary?.topContributor ? `${summary.topContributor.userName} — ${summary.topContributor.totalHours}h` : '—'],
    ['Most Active Project', summary?.mostActiveProject ? `${summary.mostActiveProject.projectName} — ${summary.mostActiveProject.totalHours}h` : '—'],
  ];
  for (const [k, v] of kpis) {
    const r = summarySheet.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: 'FF374151' } };
    r.getCell(2).font = { color: { argb: 'FF111827' } };
    r.eachCell((c) => {
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      c.alignment = { vertical: 'middle' };
    });
    r.height = 20;
  }

  summarySheet.addRow([]);
  summarySheet.addRow([]);

  // Hours by Project table
  if (summary?.hoursPerProject?.length) {
    const projHdr = summarySheet.addRow(['Project', 'Hours', 'Tasks']);
    projHdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    projHdr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      c.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    projHdr.height = 22;

    for (const p of summary.hoursPerProject) {
      const r = summarySheet.addRow([p.projectName, `${p.totalHours}h`, p.taskCount]);
      r.getCell(1).font = { color: { argb: 'FF111827' } };
      r.eachCell((c) => {
        c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    }
  }

  summarySheet.addRow([]);

  // Hours by Member table (admin team reports only)
  if (isAdmin && summary?.hoursPerMember?.length) {
    const memHdr = summarySheet.addRow(['Member', 'Hours', 'Tasks']);
    memHdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    memHdr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
      c.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    memHdr.height = 22;

    for (const m of summary.hoursPerMember) {
      const r = summarySheet.addRow([m.userName, `${m.totalHours}h`, m.taskCount]);
      r.getCell(1).font = { color: { argb: 'FF111827' } };
      r.eachCell((c) => {
        c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    }
  }

  // Auto-size columns on summary sheet
  summarySheet.columns = [
    { width: 28 }, { width: 22 }, { width: 12 }, { width: 12 },
  ];

  // ── Sheet 2: Tasks (one row per unique task with total time) ─────────────
  const tasksSheet = wb.addWorksheet('Tasks', {
    properties: { tabColor: { argb: 'FF8B5CF6' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  tasksSheet.columns = [
    { header: 'Task',     key: 'task',     width: 44 },
    { header: 'Project',  key: 'project',  width: 26 },
    { header: 'Section',  key: 'section',  width: 18 },
    { header: 'Status',   key: 'status',   width: 14 },
    { header: 'Priority', key: 'priority', width: 11 },
    { header: 'Due Date', key: 'dueDate',  width: 12 },
    { header: 'Entries',  key: 'entries',  width: 9 },
    { header: 'Minutes',  key: 'minutes',  width: 10 },
    { header: 'Hours',    key: 'hours',    width: 9 },
    { header: 'Time',     key: 'timeStr',  width: 12 },
  ];

  const tasksHeader = tasksSheet.getRow(1);
  tasksHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  tasksHeader.height = 26;
  tasksHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF6D28D9' } } };
  });

  const STATUS_COLORS_TASK = {
    DONE:        { bg: 'FFD1FAE5', fg: 'FF065F46', label: 'Completed' },
    IN_PROGRESS: { bg: 'FFDBEAFE', fg: 'FF1E40AF', label: 'In Progress' },
    REVIEW:      { bg: 'FFFEF3C7', fg: 'FF92400E', label: 'Review' },
    TODO:        { bg: 'FFE5E7EB', fg: 'FF374151', label: 'To do' },
  };
  const PRIORITY_COLORS_TASK = {
    HIGH:   { bg: 'FFFEE2E2', fg: 'FF991B1B' },
    MEDIUM: { bg: 'FFFEF3C7', fg: 'FF92400E' },
    LOW:    { bg: 'FFDBEAFE', fg: 'FF1E40AF' },
  };
  const fmtHrsLocal = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  taskTotals.forEach((t, idx) => {
    const xRow = tasksSheet.addRow({
      task: t.task,
      project: t.project,
      section: t.section || '—',
      status: STATUS_COLORS_TASK[t.status]?.label || t.status,
      priority: t.priority,
      dueDate: t.dueDate || '',
      entries: t.entries,
      minutes: t.minutes,
      hours: t.hours,
      timeStr: fmtHrsLocal(t.minutes),
    });
    xRow.height = 22;

    if (idx % 2 === 1) {
      xRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      });
    }

    xRow.getCell('task').font = { bold: true, color: { argb: 'FF111827' } };

    const sc = STATUS_COLORS_TASK[t.status];
    if (sc) {
      const sCell = xRow.getCell('status');
      sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
      sCell.font = { color: { argb: sc.fg }, bold: true, size: 10 };
      sCell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const pc = PRIORITY_COLORS_TASK[t.priority];
    if (pc) {
      const pCell = xRow.getCell('priority');
      pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pc.bg } };
      pCell.font = { color: { argb: pc.fg }, bold: true, size: 10 };
      pCell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    xRow.getCell('entries').alignment = { horizontal: 'right' };
    xRow.getCell('minutes').alignment = { horizontal: 'right' };
    xRow.getCell('hours').alignment = { horizontal: 'right' };
    xRow.getCell('hours').numFmt = '0.00';
    xRow.getCell('timeStr').alignment = { horizontal: 'right' };
    xRow.getCell('timeStr').font = { bold: true, color: { argb: 'FF4573D2' } };

    xRow.eachCell((c) => {
      if (!c.border) c.border = {};
      c.border.bottom = { style: 'hair', color: { argb: 'FFE5E7EB' } };
    });
  });

  // Tasks total row
  if (taskTotals.length > 0) {
    const totalMin = taskTotals.reduce((s, t) => s + t.minutes, 0);
    const totalHrs = +(totalMin / 60).toFixed(2);
    const totalsRow = tasksSheet.addRow({
      task: `TOTAL (${taskTotals.length} tasks)`,
      entries: taskTotals.reduce((s, t) => s + t.entries, 0),
      minutes: totalMin,
      hours: totalHrs,
      timeStr: fmtHrsLocal(totalMin),
    });
    totalsRow.height = 26;
    totalsRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
      c.font = { bold: true, color: { argb: 'FF6D28D9' }, size: 11 };
      c.border = { top: { style: 'medium', color: { argb: 'FF8B5CF6' } } };
      c.alignment = { vertical: 'middle' };
    });
    totalsRow.getCell('entries').alignment = { horizontal: 'right' };
    totalsRow.getCell('minutes').alignment = { horizontal: 'right' };
    totalsRow.getCell('hours').alignment = { horizontal: 'right' };
    totalsRow.getCell('hours').numFmt = '0.00';
    totalsRow.getCell('timeStr').alignment = { horizontal: 'right' };
  }

  tasksSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: tasksSheet.columns.length },
  };

  // ── Sheet 3: Time Entries (detail — one row per entry) ───────────────────
  const detailSheet = wb.addWorksheet('Time Entries', {
    properties: { tabColor: { argb: 'FF10B981' } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  detailSheet.columns = [
    { header: 'Date',     key: 'date',     width: 12 },
    { header: 'Person',   key: 'person',   width: 22 },
    { header: 'Project',  key: 'project',  width: 26 },
    { header: 'Section',  key: 'section',  width: 18 },
    { header: 'Task',     key: 'task',     width: 40 },
    { header: 'Status',   key: 'status',   width: 14 },
    { header: 'Priority', key: 'priority', width: 11 },
    { header: 'Due Date', key: 'dueDate',  width: 12 },
    { header: 'Minutes',  key: 'minutes',  width: 10 },
    { header: 'Hours',    key: 'hours',    width: 9 },
    { header: 'Note',     key: 'note',     width: 36 },
  ];

  // Style header row
  const detailHeader = detailSheet.getRow(1);
  detailHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  detailHeader.height = 26;
  detailHeader.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4573D2' } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'medium', color: { argb: 'FF1F2937' } } };
  });

  // Add data rows
  const STATUS_COLORS = {
    DONE:        { bg: 'FFD1FAE5', fg: 'FF065F46', label: 'Completed' },
    IN_PROGRESS: { bg: 'FFDBEAFE', fg: 'FF1E40AF', label: 'In Progress' },
    REVIEW:      { bg: 'FFFEF3C7', fg: 'FF92400E', label: 'Review' },
    TODO:        { bg: 'FFE5E7EB', fg: 'FF374151', label: 'To do' },
  };

  const PRIORITY_COLORS = {
    HIGH:   { bg: 'FFFEE2E2', fg: 'FF991B1B' },
    MEDIUM: { bg: 'FFFEF3C7', fg: 'FF92400E' },
    LOW:    { bg: 'FFDBEAFE', fg: 'FF1E40AF' },
  };

  rows.forEach((row, idx) => {
    const xRow = detailSheet.addRow({
      date: row.date,
      person: row.person,
      project: row.project,
      section: row.section,
      task: row.task,
      status: STATUS_COLORS[row.status]?.label || row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      minutes: row.minutes,
      hours: row.hours,
      note: row.note,
    });
    xRow.height = 22;

    // Zebra striping
    if (idx % 2 === 1) {
      xRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      });
    }

    // Status pill
    const statusCell = xRow.getCell('status');
    const sc = STATUS_COLORS[row.status];
    if (sc) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
      statusCell.font = { color: { argb: sc.fg }, bold: true, size: 10 };
      statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Priority pill
    const priCell = xRow.getCell('priority');
    const pc = PRIORITY_COLORS[row.priority];
    if (pc) {
      priCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pc.bg } };
      priCell.font = { color: { argb: pc.fg }, bold: true, size: 10 };
      priCell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Numeric formatting + alignment
    xRow.getCell('minutes').alignment = { horizontal: 'right' };
    xRow.getCell('hours').alignment = { horizontal: 'right' };
    xRow.getCell('hours').numFmt = '0.00';

    // Light bottom border on every cell
    xRow.eachCell((c) => {
      if (!c.border) c.border = {};
      c.border.bottom = { style: 'hair', color: { argb: 'FFE5E7EB' } };
    });
  });

  // Totals row
  if (rows.length > 0) {
    const totalMinutes = rows.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const totalHours = rows.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalsRow = detailSheet.addRow({
      task: 'TOTAL',
      minutes: totalMinutes,
      hours: +totalHours.toFixed(2),
    });
    totalsRow.height = 26;
    totalsRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      c.font = { bold: true, color: { argb: 'FF1E40AF' }, size: 11 };
      c.border = { top: { style: 'medium', color: { argb: 'FF4573D2' } } };
      c.alignment = { vertical: 'middle' };
    });
    totalsRow.getCell('minutes').alignment = { horizontal: 'right' };
    totalsRow.getCell('hours').alignment = { horizontal: 'right' };
    totalsRow.getCell('hours').numFmt = '0.00';
    totalsRow.getCell('task').alignment = { horizontal: 'right' };
  }

  // Auto-filter on the detail sheet
  detailSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: detailSheet.columns.length },
  };

  // Render to buffer
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

// ── Completion rate helper ──────────────────────────────────────────────────
// Counts tasks that have time entries in the selected period (matches the timesheet view).
// "Total" = unique tasks with time logged in period; "Completed" = those with status DONE.
async function calculateCompletionRate(workspaceId, filters, scopedUserId) {
  const { startDate, endDate } = parseDateFilter(filters);

  // Find tasks that have time entries matching the current filters
  const entryWhere = {
    task: {
      list: { board: { project: { workspaceId } } },
    },
  };

  if (filters.projectIds?.length) {
    entryWhere.task.list = { board: { project: { workspaceId, id: { in: filters.projectIds } } } };
  }
  if (scopedUserId) {
    entryWhere.task.assignees = { some: { userId: scopedUserId } };
    entryWhere.userId = scopedUserId;
  }
  if (filters.userIds?.length) {
    entryWhere.task.assignees = { some: { userId: { in: filters.userIds } } };
  }
  if (startDate || endDate) {
    entryWhere.date = {};
    if (startDate) entryWhere.date.gte = startDate;
    if (endDate) entryWhere.date.lte = endDate;
  }

  // Get unique task IDs that have entries in this period
  const entries = await prisma.timeEntry.findMany({
    where: entryWhere,
    select: { task: { select: { id: true, status: true } } },
  });

  const taskMap = {};
  for (const e of entries) {
    taskMap[e.task.id] = e.task.status;
  }

  const total = Object.keys(taskMap).length;
  const completed = Object.values(taskMap).filter(s => s === 'DONE').length;

  return {
    completed,
    total,
    rate: total ? +((completed / total) * 100).toFixed(1) : 0,
  };
}

// ── Grouping helpers ────────────────────────────────────────────────────────

// My Timesheet (task-based): project → tasks (using Task.actualTime as source of truth)
function groupTasksByProject(tasks) {
  const projects = {};
  let grandTotalMinutes = 0;

  for (const t of tasks) {
    const project = t.list.board.project;
    const taskMinutes = t.actualTime || 0;
    grandTotalMinutes += taskMinutes;

    if (!projects[project.id]) {
      projects[project.id] = {
        project,
        totalMinutes: 0,
        tasks: [],
      };
    }

    const entries = (t.timeEntries || []).map(e => ({
      id: e.id,
      minutes: e.minutes,
      note: e.note,
      date: e.date,
      userName: e.user?.name,
    }));

    projects[project.id].totalMinutes += taskMinutes;
    projects[project.id].tasks.push({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      estimatedTime: t.estimatedTime,
      actualTime: t.actualTime,
      section: t.list.name,
      totalMinutes: taskMinutes,
      entries,
    });
  }

  return {
    grandTotalMinutes,
    groups: Object.values(projects)
      .map(g => ({ ...g, tasks: g.tasks.sort((a, b) => b.totalMinutes - a.totalMinutes) }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes),
  };
}

// My Timesheet (entry-based, legacy): project → tasks → entries (with totals)
function groupByProject(entries) {
  const projects = {};
  let grandTotalMinutes = 0;

  for (const e of entries) {
    const project = e.task.list.board.project;
    grandTotalMinutes += e.minutes;

    if (!projects[project.id]) {
      projects[project.id] = {
        project,
        totalMinutes: 0,
        tasks: {},
      };
    }
    const grp = projects[project.id];
    grp.totalMinutes += e.minutes;

    if (!grp.tasks[e.task.id]) {
      grp.tasks[e.task.id] = {
        id: e.task.id,
        title: e.task.title,
        status: e.task.status,
        priority: e.task.priority,
        dueDate: e.task.dueDate,
        estimatedTime: e.task.estimatedTime,
        actualTime: e.task.actualTime,
        section: e.task.list.name,
        totalMinutes: 0,
        entries: [],
      };
    }
    grp.tasks[e.task.id].totalMinutes += e.minutes;
    grp.tasks[e.task.id].entries.push({
      id: e.id, minutes: e.minutes, note: e.note, date: e.date,
    });
  }

  return {
    grandTotalMinutes,
    groups: Object.values(projects).map(g => ({
      ...g,
      tasks: Object.values(g.tasks).sort((a, b) => b.totalMinutes - a.totalMinutes),
    })).sort((a, b) => b.totalMinutes - a.totalMinutes),
  };
}

// Team report grouped by person + project
function groupByPersonProject(entries) {
  const groups = {};
  let grandTotalMinutes = 0;

  for (const e of entries) {
    const project = e.task.list.board.project;
    const key = `${e.user.id}::${project.id}`;
    grandTotalMinutes += e.minutes;

    if (!groups[key]) {
      groups[key] = {
        key,
        user: e.user,
        project,
        totalMinutes: 0,
        tasks: {},
      };
    }
    groups[key].totalMinutes += e.minutes;

    if (!groups[key].tasks[e.task.id]) {
      groups[key].tasks[e.task.id] = {
        id: e.task.id,
        title: e.task.title,
        status: e.task.status,
        priority: e.task.priority,
        dueDate: e.task.dueDate,
        section: e.task.list.name,
        totalMinutes: 0,
        entries: [],
      };
    }
    groups[key].tasks[e.task.id].totalMinutes += e.minutes;
    groups[key].tasks[e.task.id].entries.push({
      id: e.id, minutes: e.minutes, note: e.note, date: e.date,
    });
  }

  return {
    grandTotalMinutes,
    groups: Object.values(groups).map(g => ({
      ...g,
      tasks: Object.values(g.tasks).sort((a, b) => b.totalMinutes - a.totalMinutes),
    })).sort((a, b) => b.totalMinutes - a.totalMinutes),
  };
}

// Team report grouped by project (across people)
function groupByProjectTeam(entries) {
  const groups = {};
  let grandTotalMinutes = 0;

  for (const e of entries) {
    const project = e.task.list.board.project;
    grandTotalMinutes += e.minutes;

    if (!groups[project.id]) {
      groups[project.id] = {
        key: project.id,
        project,
        totalMinutes: 0,
        members: new Set(),
        taskIds: new Set(),
        tasks: {},
      };
    }
    const grp = groups[project.id];
    grp.totalMinutes += e.minutes;
    grp.members.add(e.user.id);
    grp.taskIds.add(e.task.id);

    if (!grp.tasks[e.task.id]) {
      grp.tasks[e.task.id] = {
        id: e.task.id,
        title: e.task.title,
        status: e.task.status,
        priority: e.task.priority,
        dueDate: e.task.dueDate,
        section: e.task.list.name,
        totalMinutes: 0,
        entries: [],
      };
    }
    grp.tasks[e.task.id].totalMinutes += e.minutes;
    grp.tasks[e.task.id].entries.push({
      id: e.id, minutes: e.minutes, note: e.note, date: e.date, userName: e.user.name,
    });
  }

  return {
    grandTotalMinutes,
    groups: Object.values(groups).map(g => ({
      ...g,
      memberCount: g.members.size,
      taskCount: g.taskIds.size,
      members: undefined,
      taskIds: undefined,
      tasks: Object.values(g.tasks).sort((a, b) => b.totalMinutes - a.totalMinutes),
    })).sort((a, b) => b.totalMinutes - a.totalMinutes),
  };
}

// Team report grouped by person (across projects)
function groupByPerson(entries) {
  const groups = {};
  let grandTotalMinutes = 0;

  for (const e of entries) {
    grandTotalMinutes += e.minutes;
    if (!groups[e.user.id]) {
      groups[e.user.id] = {
        key: e.user.id,
        user: e.user,
        totalMinutes: 0,
        projectIds: new Set(),
        taskIds: new Set(),
        tasks: {},
      };
    }
    const grp = groups[e.user.id];
    grp.totalMinutes += e.minutes;
    grp.projectIds.add(e.task.list.board.project.id);
    grp.taskIds.add(e.task.id);

    if (!grp.tasks[e.task.id]) {
      grp.tasks[e.task.id] = {
        id: e.task.id,
        title: e.task.title,
        status: e.task.status,
        priority: e.task.priority,
        dueDate: e.task.dueDate,
        section: e.task.list.name,
        projectName: e.task.list.board.project.name,
        projectColor: e.task.list.board.project.color,
        totalMinutes: 0,
        entries: [],
      };
    }
    grp.tasks[e.task.id].totalMinutes += e.minutes;
    grp.tasks[e.task.id].entries.push({
      id: e.id, minutes: e.minutes, note: e.note, date: e.date,
    });
  }

  return {
    grandTotalMinutes,
    groups: Object.values(groups).map(g => ({
      ...g,
      projectCount: g.projectIds.size,
      taskCount: g.taskIds.size,
      projectIds: undefined,
      taskIds: undefined,
      tasks: Object.values(g.tasks).sort((a, b) => b.totalMinutes - a.totalMinutes),
    })).sort((a, b) => b.totalMinutes - a.totalMinutes),
  };
}

// ── Email rendering ─────────────────────────────────────────────────────────

function formatDateRange(filters) {
  const { startDate, endDate } = parseDateFilter(filters);
  if (!startDate && !endDate) return 'All time';
  const fmt = (d) => d ? d.toISOString().split('T')[0] : '…';
  return `${fmt(startDate)} → ${fmt(endDate)}`;
}

function formatHrs(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// Escape HTML to prevent injection from task titles, notes, etc.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_PILL = {
  DONE:        { bg: '#D1FAE5', fg: '#065F46', label: 'Completed' },
  IN_PROGRESS: { bg: '#DBEAFE', fg: '#1E40AF', label: 'In Progress' },
  REVIEW:      { bg: '#FEF3C7', fg: '#92400E', label: 'Review' },
  TODO:        { bg: '#E5E7EB', fg: '#374151', label: 'To do' },
};

function renderReportEmailHtml({ isAdmin, filters, summary, reportData, sender, personalMessage, taskTotals = [] }) {
  const dateRange = formatDateRange(filters);
  const totalH = (summary?.totalHours ?? 0).toFixed(2);
  const totalEntries = summary?.totalEntries || 0;
  const completionRate = summary?.completionRate?.rate || 0;
  const completionLabel = `${summary?.completionRate?.completed || 0} / ${summary?.completionRate?.total || 0} tasks`;
  const senderName = sender?.name || 'A team member';
  const senderEmail = sender?.email || '';

  const groups = reportData?.groups || [];

  // Build group sections — each group shows its title, total hours, and completed tasks list
  const groupSections = groups.slice(0, 30).map(g => {
    const title = g.user && g.project
      ? `${esc(g.user.name)} <span style="color:#9ca3af;font-weight:400"> · </span> ${esc(g.project.name)}`
      : g.user
        ? esc(g.user.name)
        : esc(g.project?.name || 'Group');

    const projectColor = g.project?.color || '#4573D2';

    const taskRows = (g.tasks || []).slice(0, 15).map(t => {
      const status = STATUS_PILL[t.status] || STATUS_PILL.TODO;
      const due = t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '—';
      return `
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:13px;color:#111827">
            <div style="font-weight:500">${esc(t.title)}</div>
            ${t.section ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${esc(t.section)}</div>` : ''}
          </td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:11px;text-align:center;white-space:nowrap">
            <span style="background:${status.bg};color:${status.fg};padding:3px 10px;border-radius:10px;font-weight:600">${status.label}</span>
          </td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap">${due}</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:600;color:#4573D2;white-space:nowrap">${formatHrs(t.totalMinutes)}</td>
        </tr>
      `;
    }).join('');

    const moreTasksNote = (g.tasks || []).length > 15
      ? `<tr><td colspan="4" style="padding:8px 14px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;text-align:center;font-style:italic">+ ${g.tasks.length - 15} more tasks</td></tr>`
      : '';

    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:18px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;overflow:hidden">
        <tr>
          <td style="padding:14px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td>
                  <div style="display:inline-block;width:8px;height:8px;background:${projectColor};border-radius:2px;margin-right:8px;vertical-align:middle"></div>
                  <span style="font-size:14px;font-weight:600;color:#1f2937;vertical-align:middle">${title}</span>
                </td>
                <td align="right" style="text-align:right">
                  <span style="background:#eff6ff;color:#1e40af;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700">${formatHrs(g.totalMinutes)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <thead>
                <tr style="background:#fafbfc">
                  <th align="left" style="padding:8px 14px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Task</th>
                  <th align="center" style="padding:8px 14px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Status</th>
                  <th align="center" style="padding:8px 14px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Due</th>
                  <th align="right" style="padding:8px 14px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Time</th>
                </tr>
              </thead>
              <tbody>${taskRows}${moreTasksNote}</tbody>
            </table>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  // ── Tasks & Time block — clean task → total time list ───────────────────
  const tasksTimeBlock = (taskTotals && taskTotals.length > 0)
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;overflow:hidden">
        <tr>
          <td style="padding:14px 18px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.9">Tasks &amp; Time</div>
            <div style="font-size:14px;font-weight:600;margin-top:2px">${taskTotals.length} completed task${taskTotals.length === 1 ? '' : 's'}</div>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <thead>
                <tr style="background:#fafbfc">
                  <th align="left" style="padding:10px 16px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Task</th>
                  <th align="left" style="padding:10px 16px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Project</th>
                  <th align="right" style="padding:10px 16px;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Time Taken</th>
                </tr>
              </thead>
              <tbody>
                ${taskTotals.slice(0, 50).map((t, i) => `
                  <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafbfc'}">
                    <td style="padding:11px 16px;border-top:1px solid #f3f4f6;font-size:13px;color:#111827;font-weight:500">
                      ${esc(t.title)}
                      ${t.section ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;font-weight:400">${esc(t.section)}</div>` : ''}
                    </td>
                    <td style="padding:11px 16px;border-top:1px solid #f3f4f6;font-size:12px;color:#6b7280">
                      <div style="display:inline-block;width:6px;height:6px;background:${t.projectColor};border-radius:1px;margin-right:6px;vertical-align:middle"></div>${esc(t.project)}
                    </td>
                    <td align="right" style="padding:11px 16px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#10b981;white-space:nowrap">
                      ${formatHrs(t.minutes)}
                    </td>
                  </tr>
                `).join('')}
                ${taskTotals.length > 50 ? `<tr><td colspan="3" style="padding:10px 16px;font-size:11px;color:#9ca3af;text-align:center;font-style:italic;border-top:1px solid #f3f4f6">+ ${taskTotals.length - 50} more tasks</td></tr>` : ''}
                <tr style="background:#ecfdf5">
                  <td colspan="2" style="padding:12px 16px;border-top:2px solid #10b981;font-size:12px;color:#065f46;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Grand Total</td>
                  <td align="right" style="padding:12px 16px;border-top:2px solid #10b981;font-size:14px;font-weight:800;color:#059669">
                    ${formatHrs(taskTotals.reduce((s, t) => s + t.minutes, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </table>
    `
    : '';

  const personalMessageBlock = personalMessage
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px">
        <tr>
          <td style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:6px">
            <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:6px">Message from ${esc(senderName)}</div>
            <div style="font-size:14px;color:#1f2937;line-height:1.6;white-space:pre-wrap">${esc(personalMessage)}</div>
          </td>
        </tr>
      </table>
    `
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Work Report</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05)">

          <!-- Gradient header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4573D2 0%,#6366f1 100%);padding:32px 32px 28px 32px;color:#ffffff">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;opacity:0.85">${isAdmin ? 'Team' : 'Personal'} Work Report</div>
              <h1 style="margin:6px 0 4px 0;font-size:26px;font-weight:700;line-height:1.2">${dateRange}</h1>
              <div style="font-size:13px;color:#ffffff;margin-top:6px">From <strong style="color:#ffffff">${esc(senderName)}</strong></div>
              ${senderEmail ? `<div style="font-size:12px;color:#fde68a;margin-top:3px">${esc(senderEmail)}</div>` : ''}
            </td>
          </tr>

          <!-- KPI cards -->
          <tr>
            <td style="padding:24px 32px 0 32px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="33%" style="padding-right:8px;vertical-align:top">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px">
                      <tr><td style="padding:14px">
                        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Total Hours</div>
                        <div style="font-size:26px;font-weight:800;color:#4573D2;margin-top:6px;line-height:1">${totalH}<span style="font-size:14px;font-weight:600;color:#6b7280">h</span></div>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" style="padding:0 4px;vertical-align:top">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
                      <tr><td style="padding:14px">
                        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Time Entries</div>
                        <div style="font-size:26px;font-weight:800;color:#16a34a;margin-top:6px;line-height:1">${totalEntries}</div>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" style="padding-left:8px;vertical-align:top">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px">
                      <tr><td style="padding:14px">
                        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Completion</div>
                        <div style="font-size:26px;font-weight:800;color:#9333ea;margin-top:6px;line-height:1">${completionRate}<span style="font-size:14px;font-weight:600;color:#6b7280">%</span></div>
                        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${completionLabel}</div>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Personal message -->
          <tr>
            <td style="padding:24px 32px 0 32px">${personalMessageBlock}</td>
          </tr>

          <!-- Tasks & Time (clean task → time list) -->
          <tr>
            <td style="padding:24px 32px 0 32px">${tasksTimeBlock}</td>
          </tr>

          <!-- Body sections -->
          <tr>
            <td style="padding:8px 32px 32px 32px">
              <h2 style="margin:8px 0 16px 0;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em">
                ${isAdmin ? 'Team Breakdown' : 'Completed Tasks by Group'}
              </h2>
              ${groupSections || '<div style="text-align:center;padding:40px 20px;color:#9ca3af;font-size:13px;background:#f9fafb;border-radius:8px">No completed tasks in this period</div>'}
              ${groups.length > 30 ? `<p style="font-size:11px;color:#9ca3af;text-align:center;font-style:italic">+ ${groups.length - 30} more groups</p>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
              <div style="font-size:11px;color:#6b7280;line-height:1.6">
                This report was sent by <strong style="color:#374151">${esc(senderName)}</strong> from Asana Clone.<br>
                Showing time logged on <strong>completed tasks</strong> only.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default reportService;
