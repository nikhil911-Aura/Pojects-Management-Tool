import prisma from '../../core/database/prisma.js';
import crypto from 'crypto';
import { ApiError } from '../../core/utils/apiResponse.js';
import emailService from '../email/emailService.js';
import config from '../../core/config/index.js';
import { emitToWorkspace } from '../../core/socket.js';

export const workspaceInviteService = {
  /**
   * Create and send a workspace invitation
   */
  async createInvite(workspaceId, inviterId, inviteData) {
    const { email, role = 'MEMBER', customRoleId = null, projectIds = [] } = inviteData;

    // Validate custom role belongs to this workspace (if provided)
    if (customRoleId) {
      const cr = await prisma.customProjectRole.findUnique({ where: { id: customRoleId } });
      if (!cr || cr.workspaceId !== workspaceId) {
        throw ApiError.badRequest('Invalid custom role for this workspace');
      }
    }

    // Validate projectIds all belong to this workspace
    let validProjectIds = [];
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds }, workspaceId },
        select: { id: true },
      });
      validProjectIds = projects.map(p => p.id);
      if (validProjectIds.length !== projectIds.length) {
        throw ApiError.badRequest('One or more selected projects are not in this workspace');
      }
    }

    // 1. Validate inviter permissions
    const inviterMembership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: inviterId,
        role: { in: ['OWNER', 'ADMIN'] }
      },
      include: {
        workspace: true,
        user: true
      }
    });

    if (!inviterMembership) {
      throw ApiError.forbidden('You do not have permission to invite users to this workspace');
    }

    // 2. Check if user is already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: existingUser.id,
            workspaceId
          }
        }
      });

      if (existingMember && existingMember.status === 'ACTIVE') {
        throw ApiError.conflict('User is already an active member of this workspace');
      }
    }

    // 3. Generate token and expiry
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // 4. Create or update invite in DB (unique by email + workspaceId)
    const invite = await prisma.workspaceInvite.upsert({
      where: { email_workspaceId: { email, workspaceId } },
      create: {
        email,
        role,
        customRoleId,
        projectIds: validProjectIds,
        token: hashedToken,
        expiresAt,
        workspaceId,
        invitedById: inviterId,
        status: 'PENDING'
      },
      update: {
        role,
        customRoleId,
        projectIds: validProjectIds,
        token: hashedToken,
        expiresAt,
        status: 'PENDING'
      }
    });

    // Special case: if we want email+workspace unique, we should have added it to schema.
    // For now, let's just create a new one every time or find by email+workspace if we had that index.
    // Since I didn't add @@unique([email, workspaceId]), I'll just create.
    /*
    const invite = await prisma.workspaceInvite.create({
      data: {
        email,
        role,
        token: hashedToken,
        expiresAt,
        workspaceId,
        invitedById: inviterId
      }
    });
    */

    // 5. Send email in background — don't block the response on SMTP latency
    const inviteLink = `${config.frontendUrl}/invite/accept/${rawToken}`;
    emailService.sendInviteEmail(
      email,
      inviterMembership.workspace.name,
      inviterMembership.user.name,
      inviteLink
    ).catch(err => {
      console.error(`[WorkspaceInviteService] Email delivery failed for ${email}:`, err?.message);
    });

    return { message: `Invitation sent to ${email}`, inviteId: invite.id };
  },

  /**
   * Validate an invitation token
   */
  async validateToken(rawToken) {
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    console.log(`[WorkspaceInviteService] Validating Raw: ${rawToken}`);
    console.log(`[WorkspaceInviteService] Validating Hash: ${hashedToken}`);
    
    const invite = await prisma.workspaceInvite.findUnique({
      where: { token: hashedToken },
      include: {
        workspace: true,
        invitedBy: {
          select: { name: true, email: true }
        }
      }
    });

    if (!invite) {
      throw ApiError.notFound('Invalid invitation token');
    }

    if (invite.status !== 'PENDING') {
      throw ApiError.badRequest(`Invitation has already been ${invite.status.toLowerCase()}`);
    }

    if (new Date() > invite.expiresAt) {
      // Mark as expired
      await prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      throw ApiError.badRequest('Invitation has expired');
    }

    // Check if the invited email already has an account
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    return { ...invite, userExists: !!existingUser };
  },

  /**
   * Accept an invitation
   */
  async acceptInvite(rawToken, userId) {
    const invite = await this.validateToken(rawToken);
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User not found');

    if (user.email !== invite.email) {
      throw ApiError.forbidden('This invitation was sent to a different email address');
    }

    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Create or Update workspace membership
      await tx.workspaceMember.upsert({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: invite.workspaceId
          }
        },
        create: {
          userId,
          workspaceId: invite.workspaceId,
          role: invite.role,
          customRoleId: invite.customRoleId || null,
          status: 'ACTIVE',
          joinedAt: new Date()
        },
        update: {
          role: invite.role,
          customRoleId: invite.customRoleId || null,
          status: 'ACTIVE',
          joinedAt: new Date()
        }
      });

      // 2. Add user to projects:
      //    - If invite.projectIds is non-empty, add to those specific projects
      //    - Else if a customRoleId was specified, add to ALL projects in the workspace
      //    - Otherwise, skip (user is workspace-only)
      const explicitProjectIds = Array.isArray(invite.projectIds) ? invite.projectIds : [];
      let projectsToJoin = [];
      if (explicitProjectIds.length > 0) {
        projectsToJoin = await tx.project.findMany({
          where: { id: { in: explicitProjectIds }, workspaceId: invite.workspaceId },
          select: { id: true },
        });
      } else if (invite.customRoleId) {
        projectsToJoin = await tx.project.findMany({
          where: { workspaceId: invite.workspaceId },
          select: { id: true },
        });
      }

      if (projectsToJoin.length > 0) {
        // Resolve the role to apply:
        // - If a custom role was chosen, use it
        // - Else: default based on workspace role
        //     GUEST   → Viewer (read-only; can't edit)
        //     MEMBER  → Editor
        //     ADMIN/OWNER → Editor (they bypass anyway)
        let targetRoleId = invite.customRoleId;
        let defaultSystemName = 'Manager';
        let legacyRole = 'EDITOR';
        if (!invite.customRoleId) {
          if (invite.role === 'GUEST') {
            defaultSystemName = 'Guest';
            legacyRole = 'VIEWER';
          }
        } else {
          legacyRole = 'CUSTOM';
        }

        if (!targetRoleId) {
          const systemRole = await tx.customProjectRole.findFirst({
            where: { workspaceId: invite.workspaceId, isSystem: true, name: defaultSystemName },
            select: { id: true },
          });
          if (systemRole) targetRoleId = systemRole.id;
        }

        for (const project of projectsToJoin) {
          await tx.projectMember.upsert({
            where: { userId_projectId: { userId, projectId: project.id } },
            create: {
              userId,
              projectId: project.id,
              role: invite.role,
              projectRole: legacyRole,
              projectRoleId: targetRoleId,
            },
            update: {
              projectRole: legacyRole,
              projectRoleId: targetRoleId,
            },
          });
        }
      }

      // 3. Update Invite Status
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      });

      return { message: 'Invitation accepted successfully', workspaceId: invite.workspaceId, inviteId: invite.id };
    }).then((result) => {
      // Notify all workspace clients so admins' member list & invite list refresh live
      emitToWorkspace(result.workspaceId, 'invite_accepted', { inviteId: result.inviteId, userId, email: invite.email });
      return result;
    });
  },

  /**
   * Resend an invitation
   */
  async resendInvite(inviteId, inviterId) {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: inviterId, role: { in: ['OWNER', 'ADMIN'] } }
            }
          }
        },
        invitedBy: true
      }
    });

    if (!invite || invite.workspace.members.length === 0) {
      throw ApiError.forbidden('You do not have permission to resend this invitation');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: {
        token: hashedToken,
        expiresAt,
        status: 'PENDING'
      }
    });

    const inviteLink = `${config.frontendUrl}/invite/accept/${rawToken}`;
    await emailService.sendInviteEmail(
      invite.email,
      invite.workspace.name,
      invite.invitedBy.name,
      inviteLink
    );

    return { message: 'Invitation resent successfully' };
  },

  /**
   * Cancel an invitation
   */
  async cancelInvite(inviteId, inviterId) {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: inviterId, role: { in: ['OWNER', 'ADMIN'] } }
            }
          }
        }
      }
    });

    if (!invite || invite.workspace.members.length === 0) {
      throw ApiError.forbidden('You do not have permission to cancel this invitation');
    }

    await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { status: 'CANCELLED' }
    });

    return { message: 'Invitation cancelled successfully' };
  },

  /**
   * Get pending invites for a workspace — OWNER/ADMIN only
   */
  async getWorkspaceInvites(workspaceId, requesterId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: requesterId, role: { in: ['OWNER', 'ADMIN'] } },
    });
    if (!membership) throw ApiError.forbidden('Only workspace admins can view pending invitations');

    // Fetch pending invites
    const invites = await prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        status: 'PENDING'
      },
      include: {
        invitedBy: { select: { name: true, email: true } },
        customRole: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    if (invites.length === 0) return invites;

    // Auto-clean: if any "pending" invite's email is already an ACTIVE member
    // (e.g. they accepted through a different pathway, or via direct add),
    // mark those invites as ACCEPTED and filter them out. Prevents stale
    // "PENDING" rows from lingering forever in the admin UI.
    const emails = invites.map(i => i.email.toLowerCase());
    const activeMembers = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: 'ACTIVE',
        user: { email: { in: emails, mode: 'insensitive' } },
      },
      include: { user: { select: { email: true } } },
    });
    const activeEmailSet = new Set(activeMembers.map(m => m.user.email.toLowerCase()));

    if (activeEmailSet.size > 0) {
      const staleInviteIds = invites
        .filter(i => activeEmailSet.has(i.email.toLowerCase()))
        .map(i => i.id);
      if (staleInviteIds.length > 0) {
        await prisma.workspaceInvite.updateMany({
          where: { id: { in: staleInviteIds } },
          data: { status: 'ACCEPTED' },
        });
      }
      return invites.filter(i => !activeEmailSet.has(i.email.toLowerCase()));
    }

    return invites;
  }
};

export default workspaceInviteService;
