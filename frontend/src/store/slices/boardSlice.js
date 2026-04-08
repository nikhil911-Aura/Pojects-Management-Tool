import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { createTask, createSubtask } from './taskSlice';

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
    /**
     * Comprehensive optimistic move that handles ALL drag-and-drop cases:
     *   1. Top-level task → another section
     *   2. Top-level task → another task's subtasks (becomes subtask)
     *   3. Subtask → a section (gets promoted to top-level)
     *   4. Subtask → another parent's subtasks (reparented)
     *   5. Reorder within same container (section or parent)
     *
     * Payload:
     *   { taskId, destListId, destParentId | null, destinationIndex }
     *
     * The reducer recursively walks all lists/subtasks to find and detach
     * the task, then inserts it at the destination position. It mutates the
     * task's listId/parentId so subsequent renders stay consistent.
     */
    optimisticMoveTaskAnywhere: (state, action) => {
      const { taskId, destListId, destParentId, destinationIndex } = action.payload;

      // Step 1: locate and detach the task from wherever it lives.
      let detached = null;
      const detachFromArray = (arr) => {
        if (!arr) return false;
        const idx = arr.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          detached = arr.splice(idx, 1)[0];
          return true;
        }
        for (const t of arr) {
          if (detachFromArray(t.subtasks)) return true;
        }
        return false;
      };
      for (const list of state.lists) {
        if (detachFromArray(list.tasks)) break;
      }
      if (!detached) return; // task not found — bail (state stays consistent)

      // Step 2: locate the destination container and insert at the right index.
      const destList = state.lists.find(l => l.id === destListId);
      if (!destList) return;

      // Update the task's own listId so future renders/refetches stay aligned.
      detached.listId = destListId;
      detached.parentId = destParentId || null;

      if (destParentId) {
        // Inserting under a parent task — find it (anywhere in the tree) and push into its subtasks.
        const findParent = (arr) => {
          if (!arr) return null;
          for (const t of arr) {
            if (t.id === destParentId) return t;
            const found = findParent(t.subtasks);
            if (found) return found;
          }
          return null;
        };
        const parent = findParent(destList.tasks) || (() => {
          for (const l of state.lists) { const f = findParent(l.tasks); if (f) return f; }
          return null;
        })();
        if (!parent) return;
        if (!parent.subtasks) parent.subtasks = [];
        const insertAt = Math.max(0, Math.min(destinationIndex, parent.subtasks.length));
        parent.subtasks.splice(insertAt, 0, detached);
      } else {
        // Inserting as a top-level task in a section.
        if (!destList.tasks) destList.tasks = [];
        const insertAt = Math.max(0, Math.min(destinationIndex, destList.tasks.length));
        destList.tasks.splice(insertAt, 0, detached);
      }
    },
    clearLists: (state) => {
      state.lists = [];
    },
    // Optimistic: instantly add a task to a list (skip if duplicate, fallback to first list)
    optimisticAddTask: (state, action) => {
      const { listId, task } = action.payload;
      let list = state.lists.find(l => l.id === listId);
      // Fallback: if listId is temp and not found, try to find any list (the section might have been replaced with real ID)
      if (!list && listId?.startsWith('temp-')) {
        list = state.lists[state.lists.length - 1]; // last added section
      }
      if (list) {
        if (!list.tasks) list.tasks = [];
        if (!list.tasks.some(t => t.id === task.id)) list.tasks.push(task);
      }
    },
    // Optimistic: instantly add a subtask under a parent (recursive, skip if duplicate)
    optimisticAddSubtask: (state, action) => {
      const { taskId, subtask } = action.payload;
      function findAndAdd(tasks) {
        if (!tasks) return false;
        for (const t of tasks) {
          if (t.id === taskId) {
            if (!t.subtasks) t.subtasks = [];
            if (!t.subtasks.some(s => s.id === subtask.id || (s.id.startsWith('temp-') && s.title === subtask.title))) {
              t.subtasks.push(subtask);
            }
            return true;
          }
          if (findAndAdd(t.subtasks)) return true;
        }
        return false;
      }
      for (const list of state.lists) {
        if (findAndAdd(list.tasks)) return;
      }
    },
    // Optimistic: instantly add a section
    // Optimistic: instantly add a section (skip if duplicate)
    optimisticAddSection: (state, action) => {
      const { section } = action.payload;
      if (!state.lists.some(l => l.id === section.id)) state.lists.push(section);
    },
    // Optimistic: update a task field in-place (recursive — any depth)
    optimisticUpdateTask: (state, action) => {
      const { taskId, data } = action.payload;
      function findAndUpdate(tasks) {
        if (!tasks) return false;
        for (const t of tasks) {
          if (t.id === taskId) { Object.assign(t, data); return true; }
          if (findAndUpdate(t.subtasks)) return true;
        }
        return false;
      }
      for (const list of state.lists) {
        if (findAndUpdate(list.tasks)) return;
      }
    },
    // Optimistic: remove a task (recursive — any depth)
    optimisticDeleteTask: (state, action) => {
      const taskId = action.payload;
      function findAndDelete(tasks) {
        if (!tasks) return false;
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) { tasks.splice(idx, 1); return true; }
        for (const t of tasks) {
          if (findAndDelete(t.subtasks)) return true;
        }
        return false;
      }
      for (const list of state.lists) {
        if (findAndDelete(list.tasks)) return;
      }
    },
    // Optimistic: rename a section
    optimisticRenameSection: (state, action) => {
      const { listId, name } = action.payload;
      const list = state.lists.find(l => l.id === listId);
      if (list) list.name = name;
    },
    // Optimistic: set assignee on a task (recursive — any depth)
    optimisticAssignUser: (state, action) => {
      const { taskId, user } = action.payload;
      function findAndAssign(tasks) {
        if (!tasks) return false;
        for (const t of tasks) {
          if (t.id === taskId) { t.assignees = [{ user }]; return true; }
          if (findAndAssign(t.subtasks)) return true;
        }
        return false;
      }
      for (const list of state.lists) {
        if (findAndAssign(list.tasks)) return;
      }
    },
    // Replace a temp task/subtask with real data (atomic — no flicker)
    // Replace temp item with real data — preserve any optimistic edits the user made
    optimisticReplaceItem: (state, action) => {
      const { tempId, item } = action.payload;

      // Helper: merge server data with any user edits on the temp item
      function mergeTask(temp, real) {
        return {
          ...real,
          status: temp.status !== 'TODO' ? temp.status : real.status,
          priority: temp.priority !== 'LOW' ? temp.priority : real.priority,
          dueDate: temp.dueDate || real.dueDate,
          taskType: temp.taskType !== 'DEFAULT_TASK' ? temp.taskType : real.taskType,
          assignees: temp.assignees?.length ? temp.assignees : real.assignees || [],
          estimatedTime: temp.estimatedTime || real.estimatedTime,
          actualTime: temp.actualTime || real.actualTime,
          subtasks: temp.subtasks || real.subtasks || [],
        };
      }

      // Replace in tasks
      for (const list of state.lists) {
        const taskIdx = list.tasks?.findIndex(t => t.id === tempId);
        if (taskIdx !== undefined && taskIdx !== -1) {
          list.tasks[taskIdx] = mergeTask(list.tasks[taskIdx], item);
          return;
        }
        // Subtask replacement (recursive)
        function replaceInSubtasks(tasks) {
          if (!tasks) return false;
          for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].id === tempId) { tasks[i] = mergeTask(tasks[i], item); return true; }
            if (replaceInSubtasks(tasks[i].subtasks)) return true;
          }
          return false;
        }
        if (replaceInSubtasks(list.tasks)) return;
      }
      // Section replacement
      const sectionIdx = state.lists.findIndex(l => l.id === tempId);
      if (sectionIdx !== -1) {
        state.lists[sectionIdx] = { ...item, tasks: state.lists[sectionIdx].tasks || item.tasks || [] };
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
        // Replace temp section matching by name, or add if not found
        const realSection = action.payload;
        const tempIdx = state.lists.findIndex(l => l.id.startsWith('temp-') && l.name === realSection.name);
        if (tempIdx !== -1) {
          state.lists[tempIdx] = { ...realSection, tasks: state.lists[tempIdx].tasks || realSection.tasks || [] };
        } else if (!state.lists.some(l => l.id === realSection.id)) {
          state.lists.push(realSection);
        }
      })
      .addCase(updateList.fulfilled, (state, action) => {
        const index = state.lists.findIndex(l => l.id === action.payload.id);
        if (index !== -1) {
          // Preserve tasks — API response may not include them
          state.lists[index] = { ...action.payload, tasks: state.lists[index].tasks || action.payload.tasks || [] };
        }
      })
      .addCase(deleteList.fulfilled, (state, action) => {
        state.lists = state.lists.filter(l => l.id !== action.payload);
      })
      .addCase(reorderLists.fulfilled, (state, action) => {
        const listIds = action.payload;
        const reordered = listIds.map(id => state.lists.find(l => l.id === id)).filter(Boolean);
        state.lists = reordered;
      })
      // Replace temp task with real one after API creates it — preserve user's optimistic edits
      .addCase(createTask.fulfilled, (state, action) => {
        const realTask = action.payload;
        if (!realTask?.listId) return;
        const list = state.lists.find(l => l.id === realTask.listId);
        if (list?.tasks) {
          const tempIdx = list.tasks.findIndex(t => t.id.startsWith('temp-') && t.title === realTask.title);
          if (tempIdx !== -1) {
            const tempTask = list.tasks[tempIdx];
            // Merge: server data as base, but preserve any fields the user changed optimistically
            list.tasks[tempIdx] = {
              ...realTask,
              status: tempTask.status !== 'TODO' ? tempTask.status : realTask.status,
              priority: tempTask.priority !== 'LOW' ? tempTask.priority : realTask.priority,
              dueDate: tempTask.dueDate || realTask.dueDate,
              taskType: tempTask.taskType !== 'DEFAULT_TASK' ? tempTask.taskType : realTask.taskType,
              assignees: tempTask.assignees?.length ? tempTask.assignees : realTask.assignees || [],
              estimatedTime: tempTask.estimatedTime || realTask.estimatedTime,
              actualTime: tempTask.actualTime || realTask.actualTime,
              subtasks: tempTask.subtasks || realTask.subtasks || [],
            };
          } else if (!list.tasks.some(t => t.id === realTask.id)) {
            list.tasks.push(realTask);
          }
        }
      })
      // Replace temp subtask with real one after API creates it — preserve optimistic edits
      .addCase(createSubtask.fulfilled, (state, action) => {
        const realSub = action.payload;
        if (!realSub?.parentId) return;
        function findAndReplace(tasks) {
          if (!tasks) return false;
          for (const t of tasks) {
            if (t.id === realSub.parentId && t.subtasks) {
              const tempIdx = t.subtasks.findIndex(s => s.id.startsWith('temp-') && s.title === realSub.title);
              if (tempIdx !== -1) {
                const tempSub = t.subtasks[tempIdx];
                t.subtasks[tempIdx] = {
                  ...realSub,
                  status: tempSub.status !== 'TODO' ? tempSub.status : realSub.status,
                  priority: tempSub.priority !== 'LOW' ? tempSub.priority : realSub.priority,
                  dueDate: tempSub.dueDate || realSub.dueDate,
                  taskType: tempSub.taskType !== 'DEFAULT_TASK' ? tempSub.taskType : realSub.taskType,
                  assignees: tempSub.assignees?.length ? tempSub.assignees : realSub.assignees || [],
                  subtasks: tempSub.subtasks || realSub.subtasks || [],
                };
                return true;
              }
              if (!t.subtasks.some(s => s.id === realSub.id)) { t.subtasks.push(realSub); return true; }
              return true;
            }
            if (findAndReplace(t.subtasks)) return true;
          }
          return false;
        }
        for (const list of state.lists) { if (findAndReplace(list.tasks)) break; }
      });
  }
});

export const { moveTask, optimisticMoveTaskAnywhere, clearLists, optimisticAddTask, optimisticAddSubtask, optimisticAddSection, optimisticUpdateTask, optimisticDeleteTask, optimisticAssignUser, optimisticRenameSection, optimisticReplaceItem } = boardSlice.actions;
export default boardSlice.reducer;
