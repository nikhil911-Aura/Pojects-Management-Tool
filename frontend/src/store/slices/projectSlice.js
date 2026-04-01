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
  async ({ projectId, userId, projectRole = 'EDITOR' }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/projects/${projectId}/members`, { userId, projectRole });
      return { projectId, member: response.data.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to add member');
    }
  }
);

export const updateProjectMemberRole = createAsyncThunk(
  'project/updateProjectMemberRole',
  async ({ projectId, memberId, projectRole }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/projects/${projectId}/members/${memberId}/role`, { projectRole });
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
  loading: false,
  projectsLoaded: false, // tracks if initial fetch completed for current workspace
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
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.loading = true;
        // Clear stale projects from previous workspace/user immediately
        // so they never flash on screen
        state.projects = [];
        state.projectsLoaded = false;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.loading = false;
        state.projects = action.payload;
        state.projectsLoaded = true;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.loading = false;
        state.projectsLoaded = true; // mark loaded even on error so we don't show spinner forever
        state.error = action.payload;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.projects.unshift(action.payload);
      })
      .addCase(fetchProject.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.loading = false;
        state.currentProject = action.payload;
      })
      .addCase(fetchProject.rejected, (state, action) => {
        state.loading = false;
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
          state.currentProject.members = [
            ...(state.currentProject.members || []),
            action.payload.member
          ];
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
      })
      // Reset all project state on logout
      .addCase(logout.fulfilled, () => initialState);
  }
});

export const { setCurrentProject, clearProjects, clearError } = projectSlice.actions;
export default projectSlice.reducer;
