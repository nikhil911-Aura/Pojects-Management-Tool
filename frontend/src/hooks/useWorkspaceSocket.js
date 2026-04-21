import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchProjects, socketProjectAdded, socketProjectRemoved, socketRoleUpdated, socketRoleDeleted } from '../store/slices/projectSlice';
import { socketWorkspaceMemberRoleChanged, socketWorkspaceRoleUpdated } from '../store/slices/workspaceSlice';

/**
 * Workspace-level socket — listens for project CRUD events
 * so the sidebar updates live when someone creates/deletes/renames a project.
 */
export const useWorkspaceSocket = () => {
  const dispatch = useAppDispatch();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { user: currentUser } = useAppSelector((state) => state.auth);
  const workspaceId = currentWorkspace?.id;
  const socketRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;

    const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 3000,
      timeout: 5000,
      transports: ['polling', 'websocket'],
      upgrade: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_workspace', workspaceId);
    });

    socket.on('connect_error', () => {});

    // Project created — refresh sidebar projects list
    socket.on('project_created', () => {
      dispatch(fetchProjects(workspaceId));
    });

    // Project updated (renamed, visibility changed) — refresh sidebar
    socket.on('project_updated', () => {
      dispatch(fetchProjects(workspaceId));
    });

    // Project deleted — refresh sidebar
    socket.on('project_deleted', () => {
      dispatch(fetchProjects(workspaceId));
    });

    // A member was added to a project in this workspace. If the added member
    // is the CURRENT user, add the project to our sidebar instantly. Critical
    // for private projects that weren't visible before being invited.
    socket.on('project_member_added', (data) => {
      if (data?.userId === currentUser?.id && data?.project?.id) {
        dispatch(socketProjectAdded(data.project));
      }
    });

    // A member was removed from a project. If it's us, remove the project
    // from sidebar (we lost access to a private project).
    socket.on('project_member_removed', (data) => {
      if (data?.userId === currentUser?.id && data?.projectId) {
        dispatch(socketProjectRemoved(data.projectId));
      }
    });

    // Role permissions updated — admin changed a role's checkboxes.
    // Patch both project members and workspace members so useRole() re-derives instantly.
    socket.on('project_role_updated', (data) => {
      if (data?.roleId) {
        dispatch(socketRoleUpdated(data));
        dispatch(socketWorkspaceRoleUpdated(data));
      }
    });

    // Workspace member's role/customRole was changed — patch their entry so
    // canWorkspace() (e.g. report.viewTeam) reflects the new role immediately.
    socket.on('workspace_member_role_changed', (data) => {
      if (data?.member) dispatch(socketWorkspaceMemberRoleChanged(data));
    });

    // Role deleted — affected members reassigned to Viewer.
    socket.on('project_role_deleted', (data) => {
      if (data?.roleId) dispatch(socketRoleDeleted(data));
    });

    return () => {
      socket.emit('leave_workspace', workspaceId);
      socket.off('connect');
      socket.off('connect_error');
      socket.off('project_created');
      socket.off('project_updated');
      socket.off('project_deleted');
      socket.off('project_member_added');
      socket.off('project_member_removed');
      socket.off('project_role_updated');
      socket.off('project_role_deleted');
      socket.off('workspace_member_role_changed');
      socket.disconnect();
    };
  }, [workspaceId, currentUser?.id, dispatch]);

  return socketRef.current;
};
