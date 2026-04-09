import express from 'express';
import projectController, { permissionKeysController, projectRoleController } from './projectController.js';
import { authenticate } from '../../core/middlewares/authMiddleware.js';
import { asyncHandler } from '../../core/middlewares/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import {
  createProjectValidation,
  updateProjectValidation,
  addMemberValidation,
  projectIdValidation
} from './projectValidation.js';

const router = express.Router();

// Static routes MUST come before /:id to avoid being caught by the wildcard param
router.get('/permission-keys', authenticate, asyncHandler(permissionKeysController.getProjectPermissionKeys));
router.put('/roles/:roleId', authenticate, asyncHandler(projectRoleController.updateRole));
router.delete('/roles/:roleId', authenticate, asyncHandler(projectRoleController.deleteRole));

// Routes
router.post('/workspace/:workspaceId', authenticate, validate(createProjectValidation), asyncHandler(projectController.create));
router.get('/workspace/:workspaceId', authenticate, asyncHandler(projectController.getAll));
router.get('/:id', authenticate, validate(projectIdValidation), asyncHandler(projectController.getById));
router.put('/:id', authenticate, validate(projectIdValidation), validate(updateProjectValidation), asyncHandler(projectController.update));
router.delete('/:id', authenticate, validate(projectIdValidation), asyncHandler(projectController.delete));

// Member management
router.post('/:id/members', authenticate, validate(projectIdValidation), validate(addMemberValidation), asyncHandler(projectController.addMember));
router.put('/:id/members/:memberId/role', authenticate, validate(projectIdValidation), asyncHandler(projectController.updateMemberRole));
router.delete('/:id/members/:memberId', authenticate, validate(projectIdValidation), asyncHandler(projectController.removeMember));

// Workspace-level project roles — shared across all projects in a workspace
router.get('/roles/workspace/:workspaceId', authenticate, asyncHandler(projectRoleController.getRoles));
router.post('/roles/workspace/:workspaceId', authenticate, asyncHandler(projectRoleController.createRole));

export default router;
