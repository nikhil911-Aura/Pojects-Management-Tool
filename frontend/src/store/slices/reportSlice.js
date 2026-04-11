import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const fetchMyTimesheet = createAsyncThunk(
  'report/fetchMyTimesheet',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters.period) params.append('period', filters.period);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.projectIds?.length) params.append('projectIds', filters.projectIds.join(','));

      const response = await api.get(`/api/v1/reports/workspace/${workspaceId}/my-timesheet?${params}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch timesheet');
    }
  }
);

export const fetchTeamReport = createAsyncThunk(
  'report/fetchTeamReport',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters.period) params.append('period', filters.period);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.projectIds?.length) params.append('projectIds', filters.projectIds.join(','));
      if (filters.userIds?.length) params.append('userIds', filters.userIds.join(','));
      if (filters.groupBy) params.append('groupBy', filters.groupBy);

      const response = await api.get(`/api/v1/reports/workspace/${workspaceId}/team?${params}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch team report');
    }
  }
);

export const fetchReportSummary = createAsyncThunk(
  'report/fetchReportSummary',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters.period) params.append('period', filters.period);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.projectIds?.length) params.append('projectIds', filters.projectIds.join(','));
      if (filters.userIds?.length) params.append('userIds', filters.userIds.join(','));

      const response = await api.get(`/api/v1/reports/workspace/${workspaceId}/summary?${params}`);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch summary');
    }
  }
);

export const exportReport = createAsyncThunk(
  'report/exportReport',
  async ({ workspaceId, filters }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (filters.period) params.append('period', filters.period);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.projectIds?.length) params.append('projectIds', filters.projectIds.join(','));
      params.append('format', 'csv');

      const response = await api.get(`/api/v1/reports/workspace/${workspaceId}/export?${params}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `time-report-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to export report');
    }
  }
);

export const emailReport = createAsyncThunk(
  'report/emailReport',
  async ({ workspaceId, filters, recipients }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/api/v1/reports/workspace/${workspaceId}/email`, {
        ...filters,
        recipients
      });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send email');
    }
  }
);

const initialState = {
  timesheetData: null,
  teamData: [],
  summary: null,
  filters: {
    period: 'week',
    startDate: null,
    endDate: null,
    projectIds: [],
    userIds: [],
    groupBy: 'person_project'
  },
  loading: false,
  error: null,
  exportLoading: false,
  emailLoading: false
};

const reportSlice = createSlice({
  name: 'report',
  initialState,
  reducers: {
    setDateFilter: (state, action) => {
      state.filters.period = action.payload.period;
      state.filters.startDate = action.payload.startDate || null;
      state.filters.endDate = action.payload.endDate || null;
    },
    setProjectFilter: (state, action) => {
      state.filters.projectIds = action.payload;
    },
    setUserFilter: (state, action) => {
      state.filters.userIds = action.payload;
    },
    setGroupBy: (state, action) => {
      state.filters.groupBy = action.payload;
    },
    clearReportData: (state) => {
      state.timesheetData = null;
      state.teamData = [];
      state.summary = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyTimesheet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyTimesheet.fulfilled, (state, action) => {
        state.loading = false;
        state.timesheetData = action.payload;
      })
      .addCase(fetchMyTimesheet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchTeamReport.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTeamReport.fulfilled, (state, action) => {
        state.loading = false;
        state.teamData = action.payload;
      })
      .addCase(fetchTeamReport.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchReportSummary.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReportSummary.fulfilled, (state, action) => {
        state.loading = false;
        state.summary = action.payload;
      })
      .addCase(fetchReportSummary.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(exportReport.pending, (state) => {
        state.exportLoading = true;
      })
      .addCase(exportReport.fulfilled, (state) => {
        state.exportLoading = false;
      })
      .addCase(exportReport.rejected, (state, action) => {
        state.exportLoading = false;
        state.error = action.payload;
      })
      .addCase(emailReport.pending, (state) => {
        state.emailLoading = true;
      })
      .addCase(emailReport.fulfilled, (state) => {
        state.emailLoading = false;
      })
      .addCase(emailReport.rejected, (state, action) => {
        state.emailLoading = false;
        state.error = action.payload;
      });
  }
});

export const { setDateFilter, setProjectFilter, setUserFilter, setGroupBy, clearReportData } = reportSlice.actions;
export default reportSlice.reducer;