import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchLists = createAsyncThunk(
  'board/fetchLists',
  async (boardId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/api/v1/lists/board/${boardId}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch lists');
    }
  }
);

export const createList = createAsyncThunk(
  'board/createList',
  async ({ boardId, name }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/lists/board/${boardId}`, { name });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create list');
    }
  }
);

export const updateList = createAsyncThunk(
  'board/updateList',
  async ({ listId, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/api/v1/lists/${listId}`, data);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update list');
    }
  }
);

export const deleteList = createAsyncThunk(
  'board/deleteList',
  async (listId, { rejectWithValue }) => {
    try {
      await api.delete(`/api/v1/lists/${listId}`);
      return listId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete list');
    }
  }
);

export const reorderLists = createAsyncThunk(
  'board/reorderLists',
  async ({ boardId, listIds }, { rejectWithValue }) => {
    try {
      await api.put(`/api/v1/lists/board/${boardId}/reorder`, { listIds });
      return listIds;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reorder lists');
    }
  }
);

const initialState = {
  lists: [],
  loading: false,
  error: null
};

const boardSlice = createSlice({
  name: 'board',
  initialState,
  reducers: {
    moveTask: (state, action) => {
      const { taskId, sourceListId, destinationListId, sourceIndex, destinationIndex } = action.payload;
      
      const sourceList = state.lists.find(l => l.id === sourceListId);
      const destList = state.lists.find(l => l.id === destinationListId);
      
      if (sourceList && destList) {
        const taskIndex = sourceList.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          const [task] = sourceList.tasks.splice(taskIndex, 1);
          destList.tasks.splice(destinationIndex, 0, task);
        }
      }
    },
    clearLists: (state) => {
      state.lists = [];
    },
    // Optimistic: instantly add a task to a list
    optimisticAddTask: (state, action) => {
      const { listId, task } = action.payload;
      const list = state.lists.find(l => l.id === listId);
      if (list) {
        if (!list.tasks) list.tasks = [];
        list.tasks.push(task);
      }
    },
    // Optimistic: instantly add a subtask under a parent
    optimisticAddSubtask: (state, action) => {
      const { listId, taskId, subtask } = action.payload;
      const list = state.lists.find(l => l.id === listId);
      if (list) {
        const parent = list.tasks?.find(t => t.id === taskId);
        if (parent) {
          if (!parent.subtasks) parent.subtasks = [];
          parent.subtasks.push(subtask);
        }
      }
    },
    // Optimistic: instantly add a section
    optimisticAddSection: (state, action) => {
      const { section } = action.payload;
      state.lists.push(section);
    },
    // Optimistic: update a task field in-place
    optimisticUpdateTask: (state, action) => {
      const { taskId, data } = action.payload;
      for (const list of state.lists) {
        // Check top-level tasks
        const task = list.tasks?.find(t => t.id === taskId);
        if (task) { Object.assign(task, data); return; }
        // Check subtasks
        for (const t of (list.tasks || [])) {
          const sub = t.subtasks?.find(s => s.id === taskId);
          if (sub) { Object.assign(sub, data); return; }
        }
      }
    },
    // Optimistic: remove a task
    optimisticDeleteTask: (state, action) => {
      const taskId = action.payload;
      for (const list of state.lists) {
        const idx = list.tasks?.findIndex(t => t.id === taskId);
        if (idx !== undefined && idx !== -1) { list.tasks.splice(idx, 1); return; }
        for (const t of (list.tasks || [])) {
          const subIdx = t.subtasks?.findIndex(s => s.id === taskId);
          if (subIdx !== undefined && subIdx !== -1) { t.subtasks.splice(subIdx, 1); return; }
        }
      }
    },
    // Optimistic: rename a section
    optimisticRenameSection: (state, action) => {
      const { listId, name } = action.payload;
      const list = state.lists.find(l => l.id === listId);
      if (list) list.name = name;
    },
    // Optimistic: set assignee on a task
    optimisticAssignUser: (state, action) => {
      const { taskId, user } = action.payload;
      for (const list of state.lists) {
        const task = list.tasks?.find(t => t.id === taskId);
        if (task) { task.assignees = [{ user }]; return; }
        for (const t of (list.tasks || [])) {
          const sub = t.subtasks?.find(s => s.id === taskId);
          if (sub) { sub.assignees = [{ user }]; return; }
        }
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLists.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLists.fulfilled, (state, action) => {
        state.loading = false;
        state.lists = action.payload;
      })
      .addCase(fetchLists.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(createList.fulfilled, (state, action) => {
        state.lists.push(action.payload);
      })
      .addCase(updateList.fulfilled, (state, action) => {
        const index = state.lists.findIndex(l => l.id === action.payload.id);
        if (index !== -1) {
          state.lists[index] = action.payload;
        }
      })
      .addCase(deleteList.fulfilled, (state, action) => {
        state.lists = state.lists.filter(l => l.id !== action.payload);
      })
      .addCase(reorderLists.fulfilled, (state, action) => {
        const listIds = action.payload;
        const reordered = listIds.map(id => state.lists.find(l => l.id === id)).filter(Boolean);
        state.lists = reordered;
      });
  }
});

export const { moveTask, clearLists, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticRenameSection } = boardSlice.actions;
export default boardSlice.reducer;
