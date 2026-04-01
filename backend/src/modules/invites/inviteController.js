import workspaceInviteService from '../workspace/workspaceInviteService.js';
import { successResponse } from '../../core/utils/apiResponse.js';

export const inviteController = {
  /**
   * Validate a token without accepting it (useful for UI to check validity)
   */
  async validateToken(req, res, next) {
    const invite = await workspaceInviteService.validateToken(req.params.token);
    return successResponse(res, invite, 'Token is valid');
  },

  /**
   * Accept an invitation
   */
  async acceptInvite(req, res, next) {
    const result = await workspaceInviteService.acceptInvite(req.params.token, req.user.id);
    return successResponse(res, result, 'Invitation accepted successfully');
  },

  /**
   * Resend an invitation
   */
  async resendInvite(req, res, next) {
    const result = await workspaceInviteService.resendInvite(req.params.id, req.user.id);
    return successResponse(res, result, 'Invitation resent successfully');
  },

  /**
   * Cancel an invitation
   */
  async cancelInvite(req, res, next) {
    const result = await workspaceInviteService.cancelInvite(req.params.id, req.user.id);
    return successResponse(res, result, 'Invitation cancelled successfully');
  }
};

export default inviteController;
