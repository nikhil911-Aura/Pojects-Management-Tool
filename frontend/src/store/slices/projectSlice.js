import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { logout } from './authSlice';

export const fetchProjects = createAsyncThunk(
  'project/fetchProjects',
  async (workspaceId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/projects/workspace/${workspaceId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch projects');
    }
  }
);

export const createProject = createAsyncThunk(
  'project/createProject',
  async ({ workspaceId, projectData }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/projects/workspace/${workspaceId}`, projectData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create project');
    }
  }
);

export const fetchProject = createAsyncThunk(
  'project/fetchProject',
  async (projectId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/projects/${projectId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch project');
    }
  }
);

export const updateProject = createAsyncThunk(
  'project/updateProject',
  async ({ projectId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/projects/${projectId}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update project');
    }
  }
);

export const deleteProject = createAsyncThunk(
  'project/deleteProject',
  async (projectId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/projects/${projectId}`);
      return projectId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete project');
    }
  }
);

export const addProjectMember = createAsyncThunk(
  'project/addProjectMember',
  async ({ projectId, userId, projectRole = 'EDITOR', roleId }, { rejectWithValue }) => {
    try {
      const body = { userId, projectRole };
      if (roleId) body.roleId = roleId;
      const response = await api.post(`/api/v1/projects/${projectId}/members`, body);
      return { projectId, member: response.data.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add member');
    }
  }
);

export const updateProjectMemberRole = createAsyncThunk(
  'project/updateProjectMemberRole',
  async ({ projectId, memberId, projectRole, roleId, customPermissions }, { rejectWithValue }) => {
    try {
      const body = {};
      if (roleId) body.roleId = roleId;
      if (projectRole) body.projectRole = projectRole;
      if (customPermissions) body.customPermissions = customPermissions;
      const response = await api.put(`/api/v1/projects/${projectId}/members/${memberId}/role`, body);
      return { projectId, member: response.data.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update role');
    }
  }
);

export const removeProjectMember = createAsyncThunk(
  'project/removeProjectMember',
  async ({ projectId, memberId }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/projects/${projectId}/members/${memberId}`);
      return { projectId, memberId };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove member');
    }
  }
);

const initialState = {
  projects: [],
  currentProject: null,
  projectsLoading: false,  // sidebar: fetching all projects for workspace
  projectLoading: false,   // main view: fetching a single project
  projectsLoaded: false,   // tracks if initial fetch completed for current workspace
  projectsForWorkspaceId: null, // which workspace the current projects[] belongs to
  pendingWorkspaceId: null,     // latest workspace requested — drops stale fetchProjects responses
  pendingProjectId: null,       // latest project requested — drops stale fetchProject responses
  error: null
};

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setCurrentProject: (state, action) => {
      state.currentProject = action.payload;
    },
    clearProjects: (state) => {
      state.projects = [];
      state.projectsLoaded = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    // Optimistic socket-driven project CRUD — lets useWorkspaceSocket apply
    // incremental patches instead of refetching the entire project list.
    socketProjectAdded: (state, action) => {
      const project = action.payload;
      if (!project?.id) return;
      if (state.projects.some(p => p.id === project.id)) return;
      state.projects.unshift(project);
    },
    // Live role permission update — patches customRole on every member
    // who uses the updated role, across currentProject AND projects array.
    socketRoleUpdated: (state, action) => {
      const { roleId, permissions, name, color } = action.payload;
      if (!roleId) return;
      // Patch currentProject members in-place
      if (state.currentProject?.members) {
        state.currentProject.members.forEach(m => {
          if (m.customRole?.id === roleId || m.projectRoleId === roleId) {
            if (!m.customRole) m.customRole = { id: roleId };
            m.customRole.permissions = permissions;
            if (name) m.customRole.name = name;
            if (color) m.customRole.color = color;
          }
        });
      }
    },
    // Live role deletion — reassign affected members to the Viewer role
    socketRoleDeleted: (state, action) => {
      const { roleId, viewerRole } = action.payload;
      if (!roleId) return;
      if (state.currentProject?.members && viewerRole) {
        state.currentProject.members.forEach(m => {
          if (m.customRole?.id === roleId || m.projectRoleId === roleId) {
            m.customRole = viewerRole;
            m.projectRoleId = viewerRole.id;
          }
        });
      }
    },
    socketProjectUpdated: (state, action) => {
      const project = action.payload;
      if (!project?.id) return;
      const idx = state.projects.findIndex(p => p.id === project.id);
      if (idx !== -1) state.projects[idx] = { ...state.projects[idx], ...project };
      if (state.currentProject?.id === project.id) {
        state.currentProject = { ...state.currentProject, ...project };
      }
    },
    socketProjectRemoved: (state, action) => {
      const projectId = action.payload;
      state.projects = state.projects.filter(p => p.id !== projectId);
      if (state.currentProject?.id === projectId) state.currentProject = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Clear all project data on logout so stale projects don't bleed across users
      .addCase(logout.fulfilled, () => initialState)
      .addCase(fetchProjects.pending, (state, action) => {
        state.projectsLoading = true;
        const requestedWorkspaceId = action.meta.arg;
        // Track the latest requested workspace so we can drop stale responses below.
        state.pendingWorkspaceId = requestedWorkspaceId;
        // Only wipe the existing projects[] when SWITCHING workspaces.
        // For same-workspace refetches keep the current list visible.
        if (requestedWorkspaceId !== state.projectsForWorkspaceId) {
          state.projects = [];
          state.projectsLoaded = false;
        }
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        const requestedWorkspaceId = action.meta.arg;
        // Race-condition guard: drop the response if the user has already
        // moved on to a different workspace (sidebar would otherwise show
        // projects from the wrong workspace).
        if (state.pendingWorkspaceId && state.pendingWorkspaceId !== requestedWorkspaceId) {
          return;
        }
        state.projectsLoading = false;
        state.projects = action.payload;
        state.projectsLoaded = true;
        state.projectsForWorkspaceId = requestedWorkspaceId;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.projectsLoading = false;
        state.projectsLoaded = true; // mark loaded even on error so we don't show spinner forever
        state.error = action.payload;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.unshift(action.payload);
      })
      .addCase(fetchProject.pending, (state, action) => {
        state.projectLoading = true;
        const requestedProjectId = action.meta.arg;
        state.pendingProjectId = requestedProjectId;
        // If we're switching to a different project, clear currentProject
        // immediately so stale data (sections, members) doesn't flash.
        if (state.currentProject && state.currentProject.id !== requestedProjectId) {
          state.currentProject = null;
        }
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        const requestedProjectId = action.meta.arg;
        // Race-condition guard: drop the response if the user has navigated
        // to a different project. Without this, project A's currentProject
        // would overwrite project B's after a fast switch.
        if (state.pendingProjectId && state.pendingProjectId !== requestedProjectId) {
          return;
        }
        state.projectLoading = false;
        state.currentProject = action.payload;
      })
      .addCase(fetchProject.rejected, (state, action) => {
        state.projectLoading = false;
        state.error = action.payload;
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const index = state.projects.findIndex(p => p.id === action.payload.id);
        if (index !== -1) {
          state.projects[index] = action.payload;
        }
        if (state.currentProject?.id === action.payload.id) {
          state.currentProject = action.payload;
        }
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.projects = state.projects.filter(p => p.id !== action.payload);
        if (state.currentProject?.id === action.payload) {
          state.currentProject = null;
        }
      })
      .addCase(addProjectMember.fulfilled, (state, action) => {
        if (state.currentProject?.id === action.payload.projectId) {
          const members = state.currentProject.members || [];
          const exists = members.some(m => m.userId === action.payload.member.userId);
          if (!exists) {
            state.currentProject.members = [...members, action.payload.member];
          }
        }
      })
      .addCase(updateProjectMemberRole.fulfilled, (state, action) => {
        if (state.currentProject?.id === action.payload.projectId) {
          const members = state.currentProject.members || [];
          const idx = members.findIndex(m => m.userId === action.payload.member.userId);
          if (idx !== -1) members[idx] = { ...members[idx], ...action.payload.member };
        }
      })
      .addCase(removeProjectMember.fulfilled, (state, action) => {
        if (state.currentProject?.id === action.payload.projectId) {
          state.currentProject.members = (state.currentProject.members || []).filter(
            m => m.userId !== action.payload.memberId
          );
        }
      });
  }
});

export const { setCurrentProject, clearProjects, clearError, socketProjectAdded, socketProjectUpdated, socketProjectRemoved, socketRoleUpdated, socketRoleDeleted } = projectSlice.actions;
export default projectSlice.reducer;
