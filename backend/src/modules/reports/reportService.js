import prisma from '../../core/database/prisma.js';
import { ApiError } from '../../core/utils/apiResponse.js';

function isWorkspaceAdmin(role) {
  return role === 'OWNER' || role === 'ADMIN';
}

function parseDateFilter(filters) {
  const now = new Date();
  let startDate = filters.startDate ? new Date(filters.startDate) : null;
  let endDate = filters.endDate ? new Date(filters.endDate) : null;

  if (!startDate && !endDate && filters.period) {
    switch (filters.period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
    }
  }

  return { startDate, endDate };
}

export const reportService = {
  async getMyTimesheet(userId, workspaceId, filters = {}) {
    const { startDate, endDate } = parseDateFilter(filters);

    const timeEntryWhere = {
      userId,
      task: {
        assignees: { some: { userId } },
        status: 'DONE',
      },
    };

    if (startDate) timeEntryWhere.date = { gte: startDate };
    if (endDate) timeEntryWhere.date = { ...timeEntryWhere.date, lte: endDate };
    if (filters.projectIds?.length) {
      timeEntryWhere.task = {
        ...timeEntryWhere.task,
        list: { board: { project: { id: { in: filters.projectIds } } } }
      };
    }

    const entries = await prisma.timeEntry.findMany({
      where: timeEntryWhere,
      include: {
        task: {
          include: {
            list: {
              include: {
                board: {
                  include: {
                    project: {
                      select: { id: true, name: true, color: true }
                    }
                  }
                }
              }
            }
          }
        },
        user: {
          select: { id: true, name: true, avatar: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    const grouped = entries.reduce((acc, entry) => {
      const dateKey = entry.date.toISOString().split('T')[0];
      const projectId = entry.task.list.board.project.id;
      const taskId = entry.task.id;

      if (!acc[dateKey]) acc[dateKey] = {};
      if (!acc[dateKey][projectId]) {
        acc[dateKey][projectId] = {
          project: entry.task.list.board.project,
          tasks: {}
        };
      }
      if (!acc[dateKey][projectId].tasks[taskId]) {
        acc[dateKey][projectId].tasks[taskId] = {
          task: {
            id: entry.task.id,
            title: entry.task.title,
            status: entry.task.status,
            dueDate: entry.task.dueDate,
            priority: entry.task.priority,
            estimatedTime: entry.task.estimatedTime,
            actualTime: entry.task.actualTime
          },
          entries: []
        };
      }
      acc[dateKey][projectId].tasks[taskId].entries.push({
        id: entry.id,
        minutes: entry.minutes,
        note: entry.note,
        date: entry.date
      });
      return acc;
    }, {});

    return { entries, grouped };
  },

  async getTeamReport(workspaceId, userId, filters = {}) {
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!workspaceMember || !isWorkspaceAdmin(workspaceMember.role)) {
      throw ApiError.forbidden('Access denied. Admin role required.');
    }

    const where = {};
    const { startDate, endDate } = parseDateFilter(filters);

    if (filters.userIds?.length) {
      where.userId = { in: filters.userIds };
    }

    if (filters.projectIds?.length) {
      where.task = {
        list: {
          board: {
            project: { id: { in: filters.projectIds } }
          }
        }
      };
    }

    if (startDate) where.date = { ...where.date, gte: startDate };
    if (endDate) where.date = { ...where.date, lte: endDate };

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        task: {
          include: {
            list: {
              include: {
                board: {
                  include: {
                    project: {
                      select: { id: true, name: true, color: true }
                    }
                  }
                }
              }
            }
          }
        },
        user: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    const groupBy = filters.groupBy || 'person_project';

    if (groupBy === 'project') {
      const grouped = entries.reduce((acc, entry) => {
        const projectId = entry.task.list.board.project.id;
        if (!acc[projectId]) {
          acc[projectId] = {
            project: entry.task.list.board.project,
            totalMinutes: 0,
            members: new Set(),
            taskCount: 0
          };
        }
        acc[projectId].totalMinutes += entry.minutes;
        acc[projectId].members.add(entry.userId);
        acc[projectId].taskCount++;
        return acc;
      }, {});
      return Object.entries(grouped).map(([id, g]) => ({
        projectId: id,
        project: g.project,
        totalHours: (g.totalMinutes / 60).toFixed(2),
        memberCount: g.members.size,
        taskCount: g.taskCount
      }));
    }

    if (groupBy === 'person') {
      const grouped = entries.reduce((acc, entry) => {
        const userId = entry.user.id;
        if (!acc[userId]) {
          acc[userId] = {
            user: entry.user,
            totalMinutes: 0,
            projectCount: 0,
            taskCount: 0
          };
        }
        acc[userId].totalMinutes += entry.minutes;
        acc[userId].projectCount++;
        acc[userId].taskCount++;
        return acc;
      }, {});
      return Object.values(grouped).map(g => ({
        user: g.user,
        totalHours: (g.totalMinutes / 60).toFixed(2),
        projectCount: g.projectCount,
        taskCount: g.taskCount
      })).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
    }

    const grouped = entries.reduce((acc, entry) => {
      const userId = entry.user.id;
      const projectId = entry.task.list.board.project.id;
      const key = `${userId}_${projectId}`;

      if (!acc[key]) {
        acc[key] = {
          user: entry.user,
          project: entry.task.list.board.project,
          totalMinutes: 0,
          taskCount: 0
        };
      }
      acc[key].totalMinutes += entry.minutes;
      acc[key].taskCount++;
      return acc;
    }, {});

    return Object.values(grouped).map(g => ({
      user: g.user,
      project: g.project,
      totalHours: (g.totalMinutes / 60).toFixed(2),
      taskCount: g.taskCount
    }));
  },

  async getReportSummary(workspaceId, userId, filters = {}) {
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });

    if (!workspaceMember || !isWorkspaceAdmin(workspaceMember.role)) {
      throw ApiError.forbidden('Access denied. Admin role required.');
    }

    const where = {};
    const { startDate, endDate } = parseDateFilter(filters);

    if (filters.userIds?.length) {
      where.userId = { in: filters.userIds };
    }

    if (filters.projectIds?.length) {
      where.task = {
        list: {
          board: {
            project: { id: { in: filters.projectIds } }
          }
        }
      };
    }

    if (startDate) where.date = { ...where.date, gte: startDate };
    if (endDate) where.date = { ...where.date, lte: endDate };

    const [totalHours, hoursPerProject, hoursPerMember, completionStats] = await Promise.all([
      prisma.timeEntry.aggregate({
        where,
        _sum: { minutes: true }
      }),
      prisma.timeEntry.findMany({
        where,
        include: {
          task: {
            include: {
              list: {
                include: {
                  board: {
                    include: {
                      project: { select: { id: true, name: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }).then(entries => {
        const projectHours = entries.reduce((acc, entry) => {
          const projectId = entry.task.list.board.project.id;
          const projectName = entry.task.list.board.project.name;
          acc[projectId] = { name: projectName, minutes: (acc[projectId]?.minutes || 0) + entry.minutes };
          return acc;
        }, {});
        return Object.entries(projectHours).map(([id, p]) => ({
          projectId: id,
          projectName: p.name,
          totalHours: (p.minutes / 60).toFixed(2)
        }));
      }),
      prisma.timeEntry.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } }
        }
      }).then(entries => {
        const memberHours = entries.reduce((acc, entry) => {
          const userId = entry.user.id;
          acc[userId] = { name: entry.user.name, minutes: (acc[userId]?.minutes || 0) + entry.minutes };
          return acc;
        }, {});
        return Object.entries(memberHours).map(([id, m]) => ({
          userId: id,
          userName: m.name,
          totalHours: (m.minutes / 60).toFixed(2)
        }));
      }),
      prisma.task.count({
        where: {
          list: {
            board: {
              project: { workspaceId }
            }
          },
          status: 'DONE'
        }
      }).then(async (completed) => {
        const total = await prisma.task.count({
          where: {
            list: {
              board: {
                project: { workspaceId }
              }
            }
          }
        });
        return { completed, total, rate: total ? ((completed / total) * 100).toFixed(1) : 0 };
      })
    ]);

    const topContributor = hoursPerMember.length > 0
      ? hoursPerMember.sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours))[0]
      : null;

    const mostActiveProject = hoursPerProject.length > 0
      ? hoursPerProject.sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours))[0]
      : null;

    return {
      totalHours: (totalHours._sum.minutes || 0) / 60,
      hoursPerProject,
      hoursPerMember,
      completionRate: completionStats,
      topContributor,
      mostActiveProject
    };
  },

  async exportReport(workspaceId, userId, filters = {}, format = 'csv') {
    const { grouped, entries } = await this.getMyTimesheet(userId, workspaceId, filters);

    const allRows = [];
    Object.entries(grouped).forEach(([date, projects]) => {
      Object.values(projects).forEach(({ project, tasks }) => {
        Object.values(tasks).forEach(({ task, entries: taskEntries }) => {
          const totalMinutes = taskEntries.reduce((sum, e) => sum + e.minutes, 0);
          allRows.push({
            date,
            projectName: project.name,
            taskTitle: task.title,
            taskStatus: task.status,
            taskDueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
            estimatedMinutes: task.estimatedTime || '',
            actualMinutes: totalMinutes,
            entries: taskEntries.length
          });
        });
      });
    });

    if (format === 'csv') {
      const headers = ['Date', 'Project', 'Task', 'Status', 'Due Date', 'Estimated (min)', 'Actual (min)', 'Entries'];
      const csvRows = [headers.join(',')];
      allRows.forEach(row => {
        csvRows.push([
          row.date,
          `"${row.projectName.replace(/"/g, '""')}"`,
          `"${row.taskTitle.replace(/"/g, '""')}"`,
          row.taskStatus,
          row.taskDueDate,
          row.estimatedMinutes,
          row.actualMinutes,
          row.entries
        ].join(','));
      });
      return csvRows.join('\n');
    }

    return allRows;
  },

  async emailReport(workspaceId, userId, filters = {}, recipients = []) {
    const { grouped, entries } = await this.getMyTimesheet(userId, workspaceId, filters);

    let totalMinutes = 0;
    const projectHours = {};
    const memberHours = {};

    Object.values(grouped).forEach(projects => {
      Object.values(projects).forEach(({ project, tasks }) => {
        if (!projectHours[project.name]) projectHours[project.name] = 0;
        Object.values(tasks).forEach(({ entries: taskEntries }) => {
          taskEntries.forEach(e => {
            totalMinutes += e.minutes;
            projectHours[project.name] += e.minutes;
          });
        });
      });
    });

    const summary = {
      totalHours: totalMinutes / 60,
      hoursPerProject: Object.entries(projectHours).map(([name, minutes]) => ({
        projectName: name,
        totalHours: (minutes / 60).toFixed(2)
      })),
      hoursPerMember: [],
      completionRate: { rate: 0 }
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4573D2; text-align: center;">Time Report Summary</h2>
        
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #333;">Overview</h3>
          <p style="margin: 5px 0;"><strong>Total Hours:</strong> ${summary.totalHours.toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Completion Rate:</strong> ${summary.completionRate.rate}%</p>
        </div>

        <h3 style="color: #333;">Hours by Project</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Project</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Hours</th>
          </tr>
          ${summary.hoursPerProject.map(p => `
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.projectName}</td>
              <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">${p.totalHours}</td>
            </tr>
          `).join('')}
        </table>

        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
        <p style="font-size: 12px; color: #777777; text-align: center;">Generated from Asana Clone</p>
      </div>
    `;

    const { emailService } = await import('../../modules/email/emailService.js');
    
    const sendPromises = recipients.map(to => 
      emailService.sendReportEmail(to, 'Time Report Summary', html)
    );

    await Promise.all(sendPromises);
    return { sent: recipients.length };
  }
};

export default reportService;