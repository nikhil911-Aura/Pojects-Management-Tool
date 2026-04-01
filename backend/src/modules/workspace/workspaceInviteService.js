import prisma from '../../core/database/prisma.js';
import crypto from 'crypto';
import { ApiError } from '../../core/utils/apiResponse.js';
import emailService from '../email/emailService.js';
import config from '../../core/config/index.js';

export const workspaceInviteService = {
  /**
   * Create and send a workspace invitation
   */
  async createInvite(workspaceId, inviterId, inviteData) {
    const { email, role = 'MEMBER' } = inviteData;

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

    // 4. Create or update invite in DB
    const invite = await prisma.workspaceInvite.upsert({
      where: { token: hashedToken }, // This is unlikely to hit on upsert with new token, but email + workspaceId unique would be better if we had it.
      // Actually, let's just find existing pending invite for this email/workspace and update it.
      create: {
        email,
        role,
        token: hashedToken,
        expiresAt,
        workspaceId,
        invitedById: inviterId,
        status: 'PENDING'
      },
      update: {
        role,
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

    // 5. Send email
    const inviteLink = `${config.frontendUrl}/invite/accept/${rawToken}`;
    console.log(`[WorkspaceInviteService] New Token Generated: ${rawToken}`);
    console.log(`[WorkspaceInviteService] Hashed Token: ${hashedToken}`);
    console.log(`[WorkspaceInviteService] Invite Saved: ${invite.id} (Status: ${invite.status})`);
    
    await emailService.sendInviteEmail(
      email,
      inviterMembership.workspace.name,
      inviterMembership.user.name,
      inviteLink
    );

    return { message: `Invitation sent to ${email}`, inviteId: invite.id, debugToken: rawToken };
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

    return invite;
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
      // 1. Create or Update Membership
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
          status: 'ACTIVE',
          joinedAt: new Date()
        },
        update: {
          role: invite.role,
          status: 'ACTIVE',
          joinedAt: new Date()
        }
      });

      // 2. Update Invite Status
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      });

      return { message: 'Invitation accepted successfully', workspaceId: invite.workspaceId };
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
   * Get pending invites for a workspace
   */
  async getWorkspaceInvites(workspaceId) {
    return await prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        status: 'PENDING'
      },
      include: {
        invitedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
};

export default workspaceInviteService;
