import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProject } from '../../store/slices/projectSlice';
import { fetchLists, createList, deleteList } from '../../store/slices/boardSlice';
import { createTask, moveTask as moveTaskAction } from '../../store/slices/taskSlice';
import ProjectListView from './ProjectListView';
import TaskDetail from '../tasks/TaskDetail';
import { useSocket } from '../../hooks/useSocket';
import { useRole } from '../../hooks/useRole';
import ShareModal from '../projects/ShareModal';
import ProjectMembersPanel from '../projects/ProjectMembersPanel';

const PRIORITY_DOT = {
  HIGH: 'bg-red-500 animate-pulse',
  MEDIUM: 'bg-yellow-400',
  LOW: 'bg-gray-300 dark:bg-gray-600',
};

const MEMBER_COLORS = ['#4573D2', '#FC636B', '#37A169', '#D69E2E', '#6A67CE', '#3BE8B0', '#F97316', '#EC4899'];

const ROLE_BADGE = {
  EDITOR:    { label: 'Editor',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  COMMENTER: { label: 'Commenter', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  VIEWER:    { label: 'Viewer',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

/* ── Inline member popover (shown on avatar click for admin/owner) ── */
function MemberPopover({ member, color, onClose, position }) {
  const ref = useRef(null);
  const role = ROLE_BADGE[member.projectRole] || ROLE_BADGE.EDITOR;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-[60] animate-fade-in"
      style={{ top: position.top, right: position.right }}
    >
      <div className="bg-[var(--asana-surface)] rounded-xl shadow-2xl border border-[var(--asana-border)] w-64 overflow-hidden">
        {/* Color banner */}
        <div className="h-14 relative" style={{ backgroundColor: color }}>
          <div className="absolute -bottom-5 left-4">
            <div
              className="w-12 h-12 rounded-full border-3 border-[var(--asana-surface)] flex items-center justify-center text-white text-lg font-bold shadow-lg"
              style={{ backgroundColor: color, borderWidth: '3px' }}
            >
              {member.user?.name?.charAt(0).toUpperCase() || '?'}
            </div>
          </div>
        </div>

        <div className="pt-8 pb-4 px-4">
          {/* Name + role */}
          <div className="flex items-start justify-between mb-1">
            <h4 className="text-sm font-bold text-[var(--asana-text-primary)] leading-tight">{member.user?.name}</h4>
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${role.cls}`}>
              {role.label}
            </span>
          </div>

          {/* Email */}
          <p className="text-xs text-[var(--asana-text-secondary)] mb-3">{member.user?.email}</p>

          {/* Divider */}
          <div className="border-t border-[var(--asana-border)] pt-3 space-y-2">
            {/* Joined info */}
            <div className="flex items-center text-xs text-[var(--asana-text-secondary)]">
              <svg className="w-3.5 h-3.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Added {member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}</span>
            </div>

            {/* Role description */}
            <div className="flex items-center text-xs text-[var(--asana-text-secondary)]">
              <svg className="w-3.5 h-3.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>
                {member.projectRole === 'EDITOR' && 'Can edit, add & delete anything'}
                {member.projectRole === 'COMMENTER' && 'Can view & comment only'}
                {member.projectRole === 'VIEWER' && 'Can view only, no edits or comments'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectBoard() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get('view') || 'board';
  const selectedTaskId = searchParams.get('task');

  const dispatch = useAppDispatch();
  const { currentProject } = useAppSelector((state) => state.project);
  const { lists } = useAppSelector((state) => state.board);

  useSocket(projectId, currentProject?.board?.id);

  const { canEdit, isWorkspaceAdmin } = useRole();

  const [showShare, setShowShare] = useState(searchParams.get('share') === '1');
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeMemberPopover, setActiveMemberPopover] = useState(null); // { member, index }

  useEffect(() => {
    dispatch(fetchProject(projectId));
  }, [projectId, dispatch]);

  useEffect(() => {
    if (currentProject?.board?.id) {
      dispatch(fetchLists(currentProject.board.id));
    }
  }, [currentProject, dispatch]);

  const handleCreateList = (e) => {
    e.preventDefault();
    if (!currentProject?.board?.id) return;
    dispatch(createList({ boardId: currentProject.board.id, name: newListName })).then(() => {
      setShowCreateList(false);
      setNewListName('');
    });
  };

  const handleCreateTask = (e, listId) => {
    e.preventDefault();
    dispatch(createTask({ listId, taskData: { title: newTaskTitle } })).then(() => {
      setShowCreateTask(null);
      setNewTaskTitle('');
      if (currentProject?.board?.id) dispatch(fetchLists(currentProject.board.id));
    });
  };

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    dispatch(moveTaskAction({ taskId: draggableId, listId: destination.droppableId, position: destination.index }))
      .then(() => { if (currentProject?.board?.id) dispatch(fetchLists(currentProject.board.id)); });
  };

  const setView = (view) => setSearchParams(prev => { prev.set('view', view); return prev; });
  const openTask = (taskId) => setSearchParams(prev => { prev.set('task', taskId); return prev; });
  const closeTask = () => setSearchParams(prev => { prev.delete('task'); return prev; });

  const handleAvatarClick = (member, index) => {
    if (!isWorkspaceAdmin) return;
    // Toggle: if same member clicked again, close popover
    if (activeMemberPopover?.member?.userId === member.userId) {
      setActiveMemberPopover(null);
    } else {
      setActiveMemberPopover({ member, index });
    }
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-asana-blue" />
      </div>
    );
  }

  const members = currentProject.members || [];
  const views = ['List', 'Board'];

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ── Project header ── */}
      <div className="bg-[var(--asana-surface)] px-6 pt-5 border-b border-[var(--asana-border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div
              className="w-9 h-9 rounded-asana flex items-center justify-center text-white font-bold text-base shadow-sm"
              style={{ backgroundColor: currentProject.color || '#4573D2' }}
            >
              {currentProject.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-[var(--asana-text-primary)]">{currentProject.name}</h1>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  currentProject.visibility === 'PRIVATE'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {currentProject.visibility === 'PRIVATE' ? 'Private' : 'Public'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* ── Member avatars with click popover ── */}
            <div className="flex items-center relative">
              <div className="flex -space-x-2">
                {members.slice(0, 5).map((m, i) => (
                  <div
                    key={m.userId || m.id}
                    className={`w-8 h-8 rounded-full border-2 border-[var(--asana-surface)] flex items-center justify-center text-white text-xs font-bold transition-all relative ${
                      isWorkspaceAdmin ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-asana-blue/40' : ''
                    } ${activeMemberPopover?.member?.userId === m.userId ? 'ring-2 ring-asana-blue scale-110' : ''}`}
                    style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length], zIndex: activeMemberPopover?.member?.userId === m.userId ? 20 : members.length - i }}
                    onClick={() => handleAvatarClick(m, i)}
                  >
                    {m.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                ))}
                {members.length > 5 && (
                  <div
                    className="w-8 h-8 rounded-full border-2 border-[var(--asana-surface)] bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-[var(--asana-text-secondary)] cursor-pointer hover:scale-110 transition-transform"
                    onClick={() => isWorkspaceAdmin && setShowMembersPanel(true)}
                  >
                    +{members.length - 5}
                  </div>
                )}
              </div>

              {/* Add member button (admin only) */}
              {isWorkspaceAdmin && (
                <button
                  onClick={() => setShowShare(true)}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-[var(--asana-text-secondary)] hover:border-asana-blue hover:text-asana-blue transition-colors ml-1"
                  title="Add member"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}

              {/* Member popover (admin/owner only) */}
              {activeMemberPopover && isWorkspaceAdmin && (
                <MemberPopover
                  member={activeMemberPopover.member}
                  color={MEMBER_COLORS[activeMemberPopover.index % MEMBER_COLORS.length]}
                  position={{ top: '44px', right: '0px' }}
                  onClose={() => setActiveMemberPopover(null)}
                />
              )}
            </div>

            {/* Share button */}
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center text-xs px-3 py-1.5 rounded-asana bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Share
            </button>

            {/* Customize / Members panel (admin only) */}
            {isWorkspaceAdmin && (
              <button
                onClick={() => setShowMembersPanel(true)}
                className="flex items-center text-xs px-3 py-1.5 rounded-asana border border-[var(--asana-border)] text-[var(--asana-text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Customize
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => setShowCreateList(true)}
                className="asana-button-primary flex items-center text-xs px-3 py-1.5"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Section
              </button>
            )}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex space-x-1">
          {views.map((view) => (
            <button
              key={view}
              onClick={() => setView(view.toLowerCase())}
              className={`px-4 py-2 text-sm font-medium transition-all relative rounded-t-md ${
                activeView === view.toLowerCase()
                  ? 'text-asana-blue'
                  : 'text-[var(--asana-text-secondary)] hover:text-[var(--asana-text-primary)]'
              }`}
            >
              {view}
              {activeView === view.toLowerCase() && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-asana-blue rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── View content ── */}
      <div className="flex-1 overflow-hidden p-6 bg-[var(--asana-bg)]">
        {activeView === 'board' ? (
          <div className="h-full overflow-x-auto pb-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex h-full space-x-4 items-start">
                {lists.map((list) => (
                  <div key={list.id} className="w-72 flex-shrink-0 flex flex-col max-h-full">
                    {/* List header */}
                    <div className="px-2 pb-2 flex items-center justify-between group">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--asana-text-secondary)]">
                          {list.name}
                        </span>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-[var(--asana-text-secondary)] rounded-full px-1.5 py-0.5 font-medium">
                          {list.tasks?.length || 0}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => dispatch(deleteList(list.id))}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-[var(--asana-text-secondary)] hover:text-red-500 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Tasks droppable */}
                    <Droppable droppableId={list.id} type="task">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto space-y-2 min-h-[80px] rounded-asana p-1 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-asana-blue/5 dark:bg-asana-blue/10' : ''
                          }`}
                        >
                          {list.tasks?.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => openTask(task.id)}
                                  className={`asana-card p-3.5 group cursor-pointer ${
                                    snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-asana-blue/30 z-50' : 'hover:-translate-y-0.5'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-[var(--asana-text-primary)] group-hover:text-asana-blue transition-colors line-clamp-2 flex-1">
                                      {task.title}
                                    </p>
                                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.LOW}`} />
                                  </div>

                                  <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center space-x-2">
                                      {task.assignees?.length > 0 && (
                                        <div className="flex -space-x-1.5">
                                          {task.assignees.slice(0, 3).map((a) => (
                                            <div
                                              key={a.user.id}
                                              className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-[9px] font-bold"
                                              style={{ backgroundColor: '#4573D2' }}
                                              title={a.user.name}
                                            >
                                              {a.user.name.charAt(0).toUpperCase()}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {task.dueDate && (
                                        <span className={`text-[10px] font-medium flex items-center px-1.5 py-0.5 rounded ${
                                          new Date(task.dueDate) < new Date()
                                            ? 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
                                            : 'text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700'
                                        }`}>
                                          <svg className="w-2.5 h-2.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </div>
                                    {task.subtasks?.length > 0 && (
                                      <span className="text-[10px] text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                                        {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>

                    {/* Add task */}
                    {canEdit && (
                      <div className="mt-2">
                        {showCreateTask === list.id ? (
                          <form onSubmit={(e) => handleCreateTask(e, list.id)} className="asana-card p-3 animate-fade-in">
                            <textarea
                              placeholder="Task name"
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 resize-none text-[var(--asana-text-primary)] placeholder-gray-400"
                              autoFocus
                              rows={2}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateTask(e, list.id); }
                                if (e.key === 'Escape') setShowCreateTask(null);
                              }}
                            />
                            <div className="flex justify-end space-x-2 mt-2 pt-2 border-t border-[var(--asana-border)]">
                              <button type="button" onClick={() => setShowCreateTask(null)} className="text-xs font-medium text-[var(--asana-text-secondary)] px-2 py-1 hover:text-[var(--asana-text-primary)] transition-colors">Cancel</button>
                              <button type="submit" className="asana-button-primary text-xs py-1 px-3">Add Task</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            onClick={() => setShowCreateTask(list.id)}
                            className="flex items-center text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs font-medium transition-colors p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 w-full"
                          >
                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add task
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add section */}
                {canEdit && (
                  <div className="w-72 flex-shrink-0">
                    {showCreateList ? (
                      <form onSubmit={handleCreateList} className="asana-card p-4 animate-fade-in">
                        <input
                          type="text"
                          placeholder="Section name"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          className="asana-input w-full text-sm mb-3"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Escape' && setShowCreateList(false)}
                        />
                        <div className="flex justify-end space-x-2">
                          <button type="button" onClick={() => setShowCreateList(false)} className="text-xs text-[var(--asana-text-secondary)] px-3 py-1 hover:text-[var(--asana-text-primary)]">Cancel</button>
                          <button type="submit" className="asana-button-primary text-xs py-1 px-4">Add Section</button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setShowCreateList(true)}
                        className="w-full flex items-center justify-center p-3 text-[var(--asana-text-secondary)] hover:text-asana-blue border-2 border-dashed border-[var(--asana-border)] hover:border-asana-blue/30 rounded-asana group transition-all"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium">Add Section</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </DragDropContext>
          </div>
        ) : (
          <ProjectListView lists={lists} boardId={currentProject?.board?.id} onTaskClick={openTask} />
        )}
      </div>

      {/* ── Share modal ── */}
      {showShare && (
        <ShareModal
          projectId={projectId}
          onClose={() => {
            setShowShare(false);
            setSearchParams(prev => { prev.delete('share'); return prev; });
          }}
        />
      )}

      {/* ── Members Panel (Admin/Owner only) ── */}
      {showMembersPanel && isWorkspaceAdmin && (
        <ProjectMembersPanel
          project={currentProject}
          onClose={() => setShowMembersPanel(false)}
          onOpenShare={() => { setShowMembersPanel(false); setShowShare(true); }}
        />
      )}

      {/* ── Task detail panel ── */}
      {selectedTaskId && (
        <div className="absolute inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm animate-fade-in" onClick={closeTask} />
          <div className="w-full max-w-2xl bg-[var(--asana-surface)] shadow-2xl relative animate-slide-in-right h-full overflow-y-auto border-l border-[var(--asana-border)]">
            <TaskDetail taskId={selectedTaskId} isEmbedded={true} onClose={closeTask} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectBoard;
