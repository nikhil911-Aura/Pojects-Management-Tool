import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { getCurrentUser } from './store/slices/authSlice';
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import Dashboard from './features/dashboard/Dashboard';
import Workspace from './features/workspace/Workspace';
import ProjectBoard from './features/board/ProjectBoard';
import TaskDetail from './features/tasks/TaskDetail';
import MyTasks from './features/tasks/MyTasks';
import Inbox from './features/inbox/Inbox';
import Profile from './features/profile/Profile';
import Settings from './features/settings/Settings';
import AcceptInvite from './features/invites/AcceptInvite';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function App() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && !isAuthenticated) {
      dispatch(getCurrentUser());
    }
  }, [dispatch, isAuthenticated]);

  if (loading && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--asana-bg)]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-asana-coral to-[#e04030] flex items-center justify-center text-white font-bold text-xl shadow-lg animate-pulse">
            A
          </div>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-asana-blue" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={location.state?.from || '/'} replace />} />
      <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to={location.state?.from || '/'} replace />} />
      <Route path="/invite/accept/:token" element={<AcceptInvite />} />

      <Route element={<Layout />}>
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/workspace/:workspaceId" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
        <Route path="/project/:projectId" element={<ProtectedRoute><ProjectBoard /></ProtectedRoute>} />
        <Route path="/task/:taskId" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
