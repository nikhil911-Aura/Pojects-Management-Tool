import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { logout, login } from './authSlice';

export const fetchWorkspaces = createAsyncThunk(
  'workspace/fetchWorkspaces',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/api/v1/workspaces');
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch workspaces');
    }
  }
);

export const createWorkspace = createAsyncThunk(
  'workspace/createWorkspace',
  async (workspaceData, { rejectWithValue }) => {
    try {
      const response = await api.post('/api/v1/workspaces', workspaceData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create workspace');
    }
  }
);

export const fetchWorkspace = createAsyncThunk(
  'workspace/fetchWorkspace',
  async (workspaceId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/workspaces/${workspaceId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch workspace');
    }
  }
);

export const updateWorkspace = createAsyncThunk(
  'workspace/updateWorkspace',
  async ({ workspaceId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/workspaces/${workspaceId}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update workspace');
    }
  }
);

export const inviteUser = createAsyncThunk(
  'workspace/inviteUser',
  async ({ workspaceId, email, role, customRoleId, projectIds }, { rejectWithValue }) => {
    try {
      const body = { email, role };
      if (customRoleId) body.customRoleId = customRoleId;
      if (Array.isArray(projectIds) && projectIds.length) body.projectIds = projectIds;
      const response = await api.post(`/api/v1/workspaces/${workspaceId}/invite`, body);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to invite user');
    }
  }
);

export const fetchInvites = createAsyncThunk(
  'workspace/fetchInvites',
  async (workspaceId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/workspaces/${workspaceId}/invites`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch invites');
    }
  }
);

export const resendInvite = createAsyncThunk(
  'workspace/resendInvite',
  async (inviteId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/invites/${inviteId}/resend`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to resend invite');
    }
  }
);

export const cancelInvite = createAsyncThunk(
  'workspace/cancelInvite',
  async (inviteId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/api/v1/invites/${inviteId}/cancel`);
      return { inviteId, ...response.data.data };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel invite');
    }
  }
);

export const acceptInvite = createAsyncThunk(
  'workspace/acceptInvite',
  async (token, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/invites/accept/${token}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to accept invitation');
    }
  }
);

const initialState = {
  workspaces: [],
  currentWorkspace: null,
  pendingInvites: [],
  loading: false,
  error: null
};

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setCurrentWorkspace: (state, action) => {
      state.currentWorkspace = action.payload;
      // Persist so the next login session restores this workspace.
      try { localStorage.setItem('lastWorkspaceId', action.payload?.id || ''); } catch {}
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Clear all workspace data on logout
      .addCase(logout.fulfilled, () => initialState)
      .addCase(fetchWorkspaces.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false;
        state.workspaces = action.payload;
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        // The create endpoint returns the raw workspace object without a `role`
        // field (role lives on the WorkspaceMember join row, only spread in by
        // getAll). The user who just created the workspace is always its OWNER,
        // so inject that here — otherwise the sidebar splits this workspace
        // into "Joined Workspaces" until the next page reload re-fetches via getAll.
        state.workspaces.unshift({ ...action.payload, role: 'OWNER' });
      })
      .addCase(fetchWorkspace.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchWorkspace.fulfilled, (state, action) => {
        state.loading = false;
        // Update the cached entry in workspaces[] so the sidebar list stays fresh.
        const idx = state.workspaces.findIndex(w => w.id === action.payload.id);
        if (idx !== -1) {
          state.workspaces[idx] = { ...state.workspaces[idx], ...action.payload };
        }
        // Only replace currentWorkspace if the fetched one IS the active one.
        // This prevents accidental workspace switching when something
        // (e.g. ShareModal's lazy member-list refetch) loads workspace data.
        if (state.currentWorkspace?.id === action.payload.id) {
          state.currentWorkspace = action.payload;
        }
      })
      .addCase(fetchWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateWorkspace.fulfilled, (state, action) => {
        const index = state.workspaces.findIndex(w => w.id === action.payload.id);
        if (index !== -1) {
          state.workspaces[index] = action.payload;
        }
        if (state.currentWorkspace?.id === action.payload.id) {
          state.currentWorkspace = action.payload;
        }
      })
      .addCase(inviteUser.fulfilled, (state) => {
        // Refresh handled by caller component or by adding to pendingInvites
      })
      .addCase(fetchInvites.fulfilled, (state, action) => {
        state.pendingInvites = action.payload;
      })
      .addCase(cancelInvite.fulfilled, (state, action) => {
        state.pendingInvites = state.pendingInvites.filter(i => i.id !== action.payload.inviteId);
      })
      // Pre-populate workspaces from login response (eliminates separate GET /workspaces call).
      // NOTE: do NOT auto-select currentWorkspace here. Layout's bootstrap effect
      // handles workspace selection with a 3-tier priority (URL param → localStorage
      // lastWorkspaceId → workspaces[0]). If we set it here, Layout sees
      // currentWorkspace already populated and skips the localStorage restore,
      // so the user always lands on workspaces[0] after re-login instead of
      // their last-used workspace.
      .addCase(login.fulfilled, (state, action) => {
        const workspaces = action.payload.workspaces;
        if (workspaces?.length) {
          state.workspaces = workspaces;
          state.loading = false;
        }
      });
  }
});

export const { setCurrentWorkspace, clearError } = workspaceSlice.actions;
export default workspaceSlice.reducer;
