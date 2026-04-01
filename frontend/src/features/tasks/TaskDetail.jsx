import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchTask, updateTask, createSubtask, deleteTask, addAttachment, removeAttachment } from '../../store/slices/taskSlice';
import api from '../../services/api';
import { useRole } from '../../hooks/useRole';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const STATUS_COLORS = {
  TODO: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  REVIEW: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

function TaskDetail({ taskId: propTaskId, isEmbedded = false, onClose }) {
  const { taskId: paramTaskId } = useParams();
  const taskId = propTaskId || paramTaskId;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentTask, loading } = useAppSelector((state) => state.task);
  const { user } = useAppSelector((state) => state.auth);
  const { canEdit, canComment } = useRole();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (taskId) dispatch(fetchTask(taskId));
  }, [taskId, dispatch]);

  useEffect(() => {
    if (currentTask) {
      setTitle(currentTask.title);
      setDescription(currentTask.description || '');
    }
  }, [currentTask]);

  const handleUpdate = (field, value) => {
    dispatch(updateTask({ taskId, data: { [field]: value } }));
  };

  const handleAddSubtask = (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    dispatch(createSubtask({ listId: currentTask.listId, taskId, subtaskData: { title: newSubtask } }))
      .then(() => setNewSubtask(''));
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    api.post(`/api/v1/comments/task/${taskId}`, { content: newComment }).then(() => {
      setNewComment('');
      dispatch(fetchTask(taskId));
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await dispatch(addAttachment({ taskId, file })).unwrap();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTask = () => {
    if (window.confirm('Delete this task?')) {
      dispatch(deleteTask(taskId)).then(() => {
        if (isEmbedded) onClose();
        else navigate(-1);
      });
    }
  };

  if (loading || !currentTask) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-asana-blue" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[var(--asana-surface)] ${!isEmbedded ? 'max-w-3xl mx-auto my-8 shadow-2xl rounded-asana-lg border border-[var(--asana-border)]' : ''}`}>
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-[var(--asana-border)] flex items-center justify-between sticky top-0 bg-[var(--asana-surface)] z-10">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => canEdit && handleUpdate('status', currentTask.status === 'DONE' ? 'TODO' : 'DONE')}
            disabled={!canEdit}
            className={`flex items-center px-3 py-1.5 rounded-asana border text-sm font-medium transition-all ${
              currentTask.status === 'DONE'
                ? 'bg-green-500 text-white border-green-500'
                : 'text-[var(--asana-text-secondary)] border-[var(--asana-border)]'
            } ${canEdit && currentTask.status !== 'DONE' ? 'hover:border-green-400 hover:text-green-600 dark:hover:text-green-400' : ''} ${!canEdit ? 'cursor-default' : ''}`}
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {currentTask.status === 'DONE' ? 'Completed' : 'Mark Complete'}
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {canEdit && (
            <button onClick={handleDeleteTask} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full text-[var(--asana-text-secondary)] hover:text-red-500 transition-colors" title="Delete task">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {isEmbedded && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-[var(--asana-text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── Title ── */}
        <div>
          {canEdit && isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                if (title !== currentTask.title) handleUpdate('title', title);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setTitle(currentTask.title); setIsEditingTitle(false); } }}
              className="text-xl font-bold w-full bg-transparent border-none p-0 focus:ring-0 text-[var(--asana-text-primary)] outline-none"
              autoFocus
            />
          ) : (
            <h1
              onClick={() => canEdit && setIsEditingTitle(true)}
              className={`text-xl font-bold text-[var(--asana-text-primary)] rounded px-1 -ml-1 transition-colors min-h-[1.5em] ${canEdit ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}`}
            >
              {currentTask.title}
            </h1>
          )}
        </div>

        {/* ── Metadata ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {/* Assignee */}
          <div className="flex items-center">
            <span className="w-28 text-[var(--asana-text-secondary)] text-xs font-medium flex-shrink-0">Assignee</span>
            <div className="flex items-center space-x-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer flex-1 min-w-0">
              {currentTask.assignees?.length > 0 ? (
                <>
                  <div className="w-6 h-6 rounded-full bg-asana-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {currentTask.assignees[0].user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[var(--asana-text-primary)] truncate">{currentTask.assignees[0].user.name}</span>
                </>
              ) : (
                <div className="flex items-center space-x-2 text-[var(--asana-text-secondary)]">
                  <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs">?</div>
                  <span className="text-xs">No assignee</span>
                </div>
              )}
            </div>
          </div>

          {/* Due Date */}
          <div className="flex items-center">
            <span className="w-28 text-[var(--asana-text-secondary)] text-xs font-medium flex-shrink-0">Due date</span>
            <input
              type="date"
              value={currentTask.dueDate ? new Date(currentTask.dueDate).toISOString().split('T')[0] : ''}
              onChange={(e) => canEdit && handleUpdate('dueDate', e.target.value)}
              readOnly={!canEdit}
              className={`bg-transparent border-none p-1.5 rounded text-sm text-[var(--asana-text-primary)] focus:ring-0 transition-colors flex-1 ${canEdit ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default'}`}
            />
          </div>

          {/* Priority */}
          <div className="flex items-center">
            <span className="w-28 text-[var(--asana-text-secondary)] text-xs font-medium flex-shrink-0">Priority</span>
            <select
              value={currentTask.priority}
              onChange={(e) => handleUpdate('priority', e.target.value)}
              disabled={!canEdit}
              className={`bg-transparent border-none p-1.5 rounded text-sm text-[var(--asana-text-primary)] focus:ring-0 transition-colors flex-1 ${canEdit ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default opacity-80'}`}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center">
            <span className="w-28 text-[var(--asana-text-secondary)] text-xs font-medium flex-shrink-0">Status</span>
            <select
              value={currentTask.status}
              onChange={(e) => handleUpdate('status', e.target.value)}
              disabled={!canEdit}
              className={`border-none p-1.5 rounded text-xs font-medium focus:ring-0 transition-colors ${STATUS_COLORS[currentTask.status]} ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* List */}
          <div className="flex items-center">
            <span className="w-28 text-[var(--asana-text-secondary)] text-xs font-medium flex-shrink-0">Section</span>
            <span className="text-sm text-[var(--asana-text-primary)] p-1.5">{currentTask.list?.name || '—'}</span>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="pt-2 border-t border-[var(--asana-border)]">
          <h3 className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-2">Description</h3>
          <textarea
            placeholder={canEdit ? 'Add more detail to this task...' : ''}
            value={description}
            onChange={(e) => canEdit && setDescription(e.target.value)}
            onBlur={() => canEdit && description !== currentTask.description && handleUpdate('description', description)}
            readOnly={!canEdit}
            className={`w-full bg-transparent border-none p-1.5 text-sm text-[var(--asana-text-primary)] placeholder-gray-400 dark:placeholder-gray-600 rounded min-h-[80px] resize-none transition-all ${canEdit ? 'focus:ring-1 focus:ring-asana-blue/20' : 'cursor-default'}`}
          />
        </div>

        {/* ── Subtasks ── */}
        <div className="pt-2 border-t border-[var(--asana-border)]">
          <h3 className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-3">Subtasks</h3>
          <div className="space-y-2">
            {currentTask.subtasks?.map((subtask) => (
              <div key={subtask.id} className="flex items-center space-x-3 group">
                <button
                  onClick={() => dispatch(updateTask({ taskId: subtask.id, data: { status: subtask.status === 'DONE' ? 'TODO' : 'DONE' } }))}
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    subtask.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                  }`}
                >
                  {subtask.status === 'DONE' && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <span className={`text-sm flex-1 ${subtask.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>
                  {subtask.title}
                </span>
                {canEdit && (
                  <button
                    onClick={() => dispatch(deleteTask(subtask.id))}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--asana-text-secondary)] hover:text-red-500 rounded transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <form onSubmit={handleAddSubtask} className="mt-2">
                <input
                  type="text"
                  placeholder="Add a subtask..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  className="w-full bg-transparent border-b border-transparent focus:border-asana-blue/40 py-1 text-sm focus:ring-0 transition-all text-[var(--asana-text-primary)] placeholder-gray-400 dark:placeholder-gray-600 outline-none"
                />
              </form>
            )}
          </div>
        </div>

        {/* ── Attachments ── */}
        <div className="pt-2 border-t border-[var(--asana-border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Attachments</h3>
            {canEdit && (
              <label className={`cursor-pointer text-xs font-medium text-asana-blue hover:text-asana-blue-dark transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                {isUploading ? 'Uploading...' : '+ Add file'}
              </label>
            )}
          </div>
          {currentTask.attachments?.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {currentTask.attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center p-2 border border-[var(--asana-border)] rounded-asana hover:bg-gray-50 dark:hover:bg-gray-800 group transition-all">
                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-2.5 text-[var(--asana-text-secondary)] flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block text-xs font-medium text-[var(--asana-text-primary)] truncate hover:text-asana-blue">
                      {attachment.filename}
                    </a>
                    <span className="text-[10px] text-[var(--asana-text-secondary)]">{(attachment.size / 1024).toFixed(1)} KB</span>
                  </div>
                  {canEdit && (
                    <button onClick={() => dispatch(removeAttachment({ taskId, attachmentId: attachment.id }))} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--asana-text-secondary)] hover:text-red-500 rounded transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Activity & Comments ── */}
        <div className="pt-2 border-t border-[var(--asana-border)]">
          <h3 className="text-xs font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider mb-4">Activity</h3>

          {/* Comment input — EDITOR or COMMENTER */}
          {canComment && (
            <div className="flex space-x-3 mb-5">
              <div className="w-7 h-7 rounded-full bg-asana-blue flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 border border-[var(--asana-border)] rounded-asana overflow-hidden focus-within:ring-2 focus-within:ring-asana-blue/20 focus-within:border-asana-blue/30 transition-all bg-[var(--asana-bg)]">
                <textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full bg-transparent p-3 text-sm focus:ring-0 resize-none min-h-[70px] border-none text-[var(--asana-text-primary)] placeholder-gray-400 dark:placeholder-gray-600 outline-none"
                />
                {newComment.trim() && (
                  <div className="flex justify-end px-3 pb-2">
                    <button onClick={handleAddComment} className="asana-button-primary text-xs py-1 px-3">
                      Comment
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity log */}
          {currentTask.activityLogs?.length > 0 && (
            <div className="space-y-3 pl-10 relative">
              <div className="absolute left-[13px] top-2 bottom-2 w-px bg-[var(--asana-border)]" />
              {currentTask.activityLogs.map((log) => (
                <div key={log.id} className="relative">
                  <div className="absolute left-[-28px] top-1 w-5 h-5 rounded-full bg-[var(--asana-surface)] border border-[var(--asana-border)] flex items-center justify-center z-10">
                    <div className="w-1.5 h-1.5 rounded-full bg-asana-blue/40" />
                  </div>
                  <p className="text-sm text-[var(--asana-text-primary)]">
                    <span className="font-semibold">{log.user?.name}</span>
                    <span className="text-[var(--asana-text-secondary)] ml-1">
                      {log.action === 'TASK_CREATED' ? 'created this task' :
                       log.action === 'TASK_UPDATED' ? 'updated this task' :
                       log.action === 'SUBTASK_CREATED' ? 'added a subtask' :
                       log.action.toLowerCase().replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="text-[10px] text-[var(--asana-text-secondary)] mt-0.5">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;
