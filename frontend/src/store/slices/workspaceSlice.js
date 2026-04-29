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

export const deleteWorkspace = createAsyncThunk(
  'workspace/deleteWorkspace',
  async (workspaceId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/workspaces/${workspaceId}`);
      return workspaceId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete workspace');
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
      const payload = action.payload;
      // role lives on the WorkspaceMember join row and is only present when the
      // workspace was fetched via getAll/getById. Fall back to the cached entry
      // in workspaces[] so we never lose it (e.g. after workspace creation).
      const role = payload?.role ?? state.workspaces.find(w => w.id === payload?.id)?.role ?? null;
      state.currentWorkspace = { ...payload, role };
      try { localStorage.setItem('lastWorkspaceId', payload?.id || ''); } catch {}
    },
    clearError: (state) => {
      state.error = null;
    },
    // Fired when a workspace member is assigned a new role/customRole.
    // Patches currentWorkspace.members so canWorkspace() updates live.
    socketWorkspaceMemberRoleChanged: (state, action) => {
      const { member } = action.payload;
      if (!member?.userId) return;
      const patch = (members) => {
        if (!members) return;
        const idx = members.findIndex(m => m.userId === member.userId);
        if (idx !== -1) members[idx] = { ...members[idx], ...member };
      };
      patch(state.currentWorkspace?.members);
      state.workspaces.forEach(w => patch(w.members));
    },
    // Fired when a role's permissions are edited.
    // Patches the customRole.permissions on every workspace member using that role.
    socketWorkspaceRoleUpdated: (state, action) => {
      const { roleId, permissions, name, color } = action.payload;
      if (!roleId) return;
      const patch = (members) => {
        if (!members) return;
        members.forEach(m => {
          if (m.customRole?.id === roleId) {
            m.customRole.permissions = permissions;
            if (name) m.customRole.name = name;
            if (color) m.customRole.color = color;
          }
        });
      };
      patch(state.currentWorkspace?.members);
      state.workspaces.forEach(w => patch(w.members));
    },
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
        // Preserve role — the update endpoint returns a raw workspace object
        // without the role field (role lives on the WorkspaceMember join row).
        const role = state.workspaces[index]?.role ?? state.currentWorkspace?.role;
        const updated = { ...action.payload, role };
        if (index !== -1) {
          state.workspaces[index] = updated;
        }
        if (state.currentWorkspace?.id === action.payload.id) {
          state.currentWorkspace = updated;
        }
      })
      .addCase(deleteWorkspace.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.workspaces = state.workspaces.filter(w => w.id !== deletedId);
        if (state.currentWorkspace?.id === deletedId) {
          state.currentWorkspace = state.workspaces[0] ?? null;
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

export const { setCurrentWorkspace, clearError, socketWorkspaceMemberRoleChanged, socketWorkspaceRoleUpdated } = workspaceSlice.actions;
export default workspaceSlice.reducer;
