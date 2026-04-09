import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { acceptInvite } from '../../store/slices/workspaceSlice';
import api from '../../services/api';

const INVITE_TOKEN_KEY = 'pendingInviteToken';

function AcceptInvite() {
  const { token: urlToken } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user: currentUser, isAuthenticated } = useAppSelector((state) => state.auth);
  
  // Token priority: URL param > localStorage
  const [token] = useState(() => urlToken || localStorage.getItem(INVITE_TOKEN_KEY));
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);

  useEffect(() => {
    // Persist token from URL to localStorage for redundancy
    if (urlToken && !localStorage.getItem(INVITE_TOKEN_KEY)) {
      localStorage.setItem(INVITE_TOKEN_KEY, urlToken);
    }
  }, [urlToken]);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('No invitation token found');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/v1/invites/validate/${token}`);
        setInvite(response.data.data);

        // Check email mismatch
        if (currentUser && currentUser.email !== response.data.data.email) {
          setEmailMismatch(true);
        }
      } catch (err) {
        const message = err.response?.data?.message || 'Invalid or expired invitation';
        setError(message);
        // Token reached a terminal state (accepted / cancelled / expired / invalid).
        // Clear it from localStorage so the user isn't redirected back here on
        // every subsequent login. Without this, the post-login flow in Login.jsx
        // re-reads the stale token forever and the user is stuck in a loop.
        const lower = String(message).toLowerCase();
        const isTerminal =
          lower.includes('accepted') ||
          lower.includes('cancelled') ||
          lower.includes('canceled') ||
          lower.includes('expired') ||
          lower.includes('invalid');
        if (isTerminal) {
          localStorage.removeItem(INVITE_TOKEN_KEY);
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      validateToken();
    } else {
      // No token in URL or localStorage — make sure no stale token is left behind.
      localStorage.removeItem(INVITE_TOKEN_KEY);
      setLoading(false);
    }
  }, [token, currentUser]);

  const handleAccept = async () => {
    // If not logged in, store token in localStorage (survives refresh/close) and redirect
    if (!isAuthenticated) {
      localStorage.setItem(INVITE_TOKEN_KEY, token);
      navigate('/login', { state: { from: `/invite/accept/${token}` } });
      return;
    }

    // If email mismatch, show error
    if (currentUser.email !== invite.email) {
      setError(`This invitation was sent to ${invite.email}, but you are logged in as ${currentUser.email}. Please log out and use the correct account, or contact the workspace administrator.`);
      return;
    }

    setProcessing(true);
    try {
      const result = await dispatch(acceptInvite(token)).unwrap();
      // Clear token on successful acceptance
      localStorage.removeItem(INVITE_TOKEN_KEY);
      navigate(`/workspace/${result.workspaceId}`);
    } catch (err) {
      setError(err || 'Failed to accept invitation');
      setProcessing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem(INVITE_TOKEN_KEY);
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    // Detect specific backend error states from validateToken so we can show
    // a friendly title/icon instead of a generic "problem".
    const lower = String(error).toLowerCase();
    const isCancelled = lower.includes('cancelled') || lower.includes('canceled');
    const isExpired = lower.includes('expired');
    const isAccepted = lower.includes('already been accepted');
    const isInvalid = lower.includes('invalid');

    let title = 'Invitation Problem';
    let body = error;
    if (isCancelled) {
      title = 'Invitation Cancelled';
      body = 'The workspace administrator cancelled this invitation. Please contact them to request a new one.';
    } else if (isExpired) {
      title = 'Invitation Expired';
      body = 'This invitation link has expired. Ask the workspace administrator to send you a new one.';
    } else if (isAccepted) {
      title = 'Already Accepted';
      body = 'This invitation has already been accepted. You can sign in to access the workspace.';
    } else if (isInvalid) {
      title = 'Invalid Invitation';
      body = 'This invitation link is not valid. It may have been removed or mistyped.';
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600 mb-6">{body}</p>
          <Link to="/" className="inline-block bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-primary-600 p-8 text-center text-white">
          <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <span className="text-4xl font-bold text-white leading-none">{invite.workspace.name.charAt(0)}</span>
          </div>
          <h2 className="text-2xl font-bold">You're Invited!</h2>
          <p className="text-primary-100 mt-2">To join <strong>{invite.workspace.name}</strong></p>
        </div>
        
        <div className="p-8">
          <div className="flex items-center space-x-4 mb-8 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xl">
              {invite.invitedBy.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Invited by</p>
              <p className="text-lg font-bold text-gray-900">{invite.invitedBy.name}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Email mismatch warning */}
            {emailMismatch && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>This invitation was sent to <strong>{invite.email}</strong></span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleLogout} className="text-amber-700 underline font-medium">
                    Log out
                  </button>
                  <span>to use a different account</span>
                </div>
              </div>
            )}
            
            <button
              onClick={handleAccept}
              disabled={processing || emailMismatch}
              className={`w-full font-bold py-3 px-6 rounded-lg transition-all shadow-md hover:shadow-lg transform active:scale-95 disabled:opacity-50 ${
                currentUser 
                  ? 'bg-primary-600 text-white hover:bg-primary-700' 
                  : 'bg-white border-2 border-primary-600 text-primary-600 hover:bg-primary-50'
              }`}
            >
              {processing ? 'Accepting...' : currentUser ? 'Accept Invitation' : 'Sign up to join'}
            </button>
            {!currentUser && (
              <p className="text-xs text-center text-gray-500 mt-2">
                Already have an account? <button onClick={() => { localStorage.setItem(INVITE_TOKEN_KEY, token); navigate('/login', { state: { from: `/invite/accept/${token}` } }); }} className="text-primary-600 hover:underline font-medium">Log in</button>
              </p>
            )}
            <p className="text-xs text-center text-gray-400">
              By joining, you agree to our terms and privacy policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AcceptInvite;
