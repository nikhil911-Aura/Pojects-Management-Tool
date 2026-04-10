import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const createTask = createAsyncThunk(
  'task/createTask',
  async ({ listId, taskData }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/tasks/list/${listId}`, taskData);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create task');
    }
  }
);

export const fetchTask = createAsyncThunk(
  'task/fetchTask',
  async (taskId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/tasks/${taskId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch task');
    }
  }
);

export const updateTask = createAsyncThunk(
  'task/updateTask',
  async ({ taskId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/tasks/${taskId}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update task');
    }
  }
);

export const deleteTask = createAsyncThunk(
  'task/deleteTask',
  async (taskId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/tasks/${taskId}`);
      return taskId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete task');
    }
  }
);

export const moveTask = createAsyncThunk(
  'task/moveTask',
  async ({ taskId, listId, position, parentId }, { rejectWithValue }) => {
    try {
      const body = { listId, position };
      if (parentId !== undefined) body.parentId = parentId;
      const response = await api.put(`/api/v1/tasks/${taskId}/move`, body);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to move task');
    }
  }
);

export const createSubtask = createAsyncThunk(
  'task/createSubtask',
  async ({ listId, taskId, subtaskData }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/tasks/list/${listId}`, { ...subtaskData, parentId: taskId });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create subtask');
    }
  }
);

export const assignUser = createAsyncThunk(
  'task/assignUser',
  async ({ taskId, userId }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/tasks/${taskId}/assignees`, { userId });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to assign user');
    }
  }
);

export const addAttachment = createAsyncThunk(
  'task/addAttachment',
  async ({ taskId, file }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post(`/api/v1/tasks/${taskId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload attachment');
    }
  }
);

export const removeAttachment = createAsyncThunk(
  'task/removeAttachment',
  async ({ taskId, attachmentId }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`);
      return attachmentId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete attachment');
    }
  }
);

export const searchTasks = createAsyncThunk(
  'task/searchTasks',
  async ({ workspaceId, query }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/tasks/workspace/${workspaceId}/search?q=${query}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to search tasks');
    }
  }
);

const initialState = {
  currentTask: null,
  searchResults: [],
  loading: false,
  error: null
};

const taskSlice = createSlice({
  name: 'task',
  initialState,
  reducers: {
    setCurrentTask: (state, action) => {
      state.currentTask = action.payload;
    },
    clearCurrentTask: (state) => {
      state.currentTask = null;
    },
    clearSearchResults: (state) => {
      state.searchResults = [];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(createTask.fulfilled, (state, action) => {
        // We don't necessarily update currentTask here as it might be added to a list board
      })
      .addCase(fetchTask.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTask.fulfilled, (state, action) => {
        state.loading = false;
        state.currentTask = action.payload;
      })
      .addCase(fetchTask.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateTask.fulfilled, (state, action) => {
        state.currentTask = action.payload;
      })
      .addCase(deleteTask.fulfilled, (state) => {
        state.currentTask = null;
      })
      .addCase(createSubtask.fulfilled, (state, action) => {
        if (state.currentTask && state.currentTask.id === action.payload.parentId) {
          if (!state.currentTask.subtasks) state.currentTask.subtasks = [];
          if (!state.currentTask.subtasks.some(s => s.id === action.payload.id)) {
            // Replace temp subtask or add
            const tempIdx = state.currentTask.subtasks.findIndex(s => s.id.startsWith('temp-'));
            if (tempIdx !== -1) state.currentTask.subtasks[tempIdx] = action.payload;
            else state.currentTask.subtasks.push(action.payload);
          }
        }
      })
      .addCase(moveTask.fulfilled, (state, action) => {
        if (state.currentTask?.id === action.payload.id) {
          state.currentTask = action.payload;
        }
      })
      .addCase(assignUser.fulfilled, (state, action) => {
        if (state.currentTask) {
          if (!state.currentTask.assignees) state.currentTask.assignees = [];
          state.currentTask.assignees.push(action.payload);
        }
      })
      .addCase(addAttachment.fulfilled, (state, action) => {
        if (state.currentTask) {
          if (!state.currentTask.attachments) state.currentTask.attachments = [];
          if (!state.currentTask.attachments.some(a => a.id === action.payload.id)) {
            state.currentTask.attachments.unshift(action.payload);
          }
        }
      })
      .addCase(removeAttachment.fulfilled, (state, action) => {
        if (state.currentTask?.attachments) {
          state.currentTask.attachments = state.currentTask.attachments.filter(a => a.id !== action.payload);
        }
      })
      .addCase(searchTasks.fulfilled, (state, action) => {
        state.searchResults = action.payload;
      });
  }
});

export const { setCurrentTask, clearCurrentTask, clearSearchResults } = taskSlice.actions;
export default taskSlice.reducer;
