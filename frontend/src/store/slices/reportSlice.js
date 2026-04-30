import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// ── Helper: serialise filters → query string ────────────────────────────────
function buildParams(filters) {
  const params = new URLSearchParams();
  if (filters.period) params.append('period', filters.period);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.projectIds?.length) params.append('projectIds', filters.projectIds.join(','));
  if (filters.userIds?.length) params.append('userIds', filters.userIds.join(','));
  if (filters.groupBy) params.append('groupBy', filters.groupBy);
  if (filters.scope) params.append('scope', filters.scope);
  if (filters.billable !== null && filters.billable !== undefined) params.append('billable', filters.billable);
  return params;
}

// ── Thunks ──────────────────────────────────────────────────────────────────

export const fetchMyTimesheet = createAsyncThunk(
  'report/fetchMyTimesheet',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/api/v1/reports/workspace/${workspaceId}/my-timesheet?${buildParams(filters)}`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch timesheet');
    }
  }
);

export const fetchTeamReport = createAsyncThunk(
  'report/fetchTeamReport',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/api/v1/reports/workspace/${workspaceId}/team?${buildParams(filters)}`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch team report');
    }
  }
);

export const fetchReportSummary = createAsyncThunk(
  'report/fetchReportSummary',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const res = await api.get(`/api/v1/reports/workspace/${workspaceId}/summary?${buildParams(filters)}`);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch summary');
    }
  }
);

export const exportReport = createAsyncThunk(
  'report/exportReport',
  async ({ workspaceId, filters, scope, format = 'xlsx' }, { rejectWithValue }) => {
    try {
      const params = buildParams({ ...filters, scope });
      params.append('format', format);
      const res = await api.get(`/api/v1/reports/workspace/${workspaceId}/export?${params}`, {
        responseType: 'blob',
      });
      const mime = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `work-report-${new Date().toISOString().split('T')[0]}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to export report');
    }
  }
);

export const emailReport = createAsyncThunk(
  'report/emailReport',
  async ({ workspaceId, filters, recipients, message }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/api/v1/reports/workspace/${workspaceId}/email`, {
        ...filters,
        recipients,
        message: message || '',
      });
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to send email');
    }
  }
);

// ── Slice ───────────────────────────────────────────────────────────────────

const initialState = {
  timesheetData: null,   // { grandTotalMinutes, groups: [{project, totalMinutes, tasks}] }
  teamData: null,        // { grandTotalMinutes, groups: [...] }
  summary: null,
  filters: {
    period: 'week',
    startDate: null,
    endDate: null,
    projectIds: [],
    userIds: [],
    groupBy: 'person_project',
    billable: null,
  },
  loadingTimesheet: false,
  loadingTeam: false,
  loadingSummary: false,
  exportLoading: false,
  emailLoading: false,
  error: null,
};

const reportSlice = createSlice({
  name: 'report',
  initialState,
  reducers: {
    setDateFilter: (state, action) => {
      state.filters.period = action.payload.period ?? null;
      state.filters.startDate = action.payload.startDate ?? null;
      state.filters.endDate = action.payload.endDate ?? null;
    },
    setProjectFilter: (state, action) => { state.filters.projectIds = action.payload; },
    setUserFilter: (state, action) => { state.filters.userIds = action.payload; },
    setGroupBy: (state, action) => { state.filters.groupBy = action.payload; },
    setBillableFilter: (state, action) => { state.filters.billable = action.payload; },
    clearReportData: (state) => {
      state.timesheetData = null;
      state.teamData = null;
      state.summary = null;
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyTimesheet.pending,   (s) => { s.loadingTimesheet = true; s.error = null; })
      .addCase(fetchMyTimesheet.fulfilled, (s, a) => { s.loadingTimesheet = false; s.timesheetData = a.payload; })
      .addCase(fetchMyTimesheet.rejected,  (s, a) => { s.loadingTimesheet = false; s.error = a.payload; })

      .addCase(fetchTeamReport.pending,    (s) => { s.loadingTeam = true; s.error = null; })
      .addCase(fetchTeamReport.fulfilled,  (s, a) => { s.loadingTeam = false; s.teamData = a.payload; })
      .addCase(fetchTeamReport.rejected,   (s, a) => { s.loadingTeam = false; s.error = a.payload; })

      .addCase(fetchReportSummary.pending,   (s) => { s.loadingSummary = true; })
      .addCase(fetchReportSummary.fulfilled, (s, a) => { s.loadingSummary = false; s.summary = a.payload; })
      .addCase(fetchReportSummary.rejected,  (s, a) => { s.loadingSummary = false; s.error = a.payload; })

      .addCase(exportReport.pending,   (s) => { s.exportLoading = true; })
      .addCase(exportReport.fulfilled, (s) => { s.exportLoading = false; })
      .addCase(exportReport.rejected,  (s, a) => { s.exportLoading = false; s.error = a.payload; })

      .addCase(emailReport.pending,   (s) => { s.emailLoading = true; })
      .addCase(emailReport.fulfilled, (s) => { s.emailLoading = false; })
      .addCase(emailReport.rejected,  (s, a) => { s.emailLoading = false; s.error = a.payload; });
  },
});

export const { setDateFilter, setProjectFilter, setUserFilter, setGroupBy, setBillableFilter, clearReportData, clearError } = reportSlice.actions;
export default reportSlice.reducer;
