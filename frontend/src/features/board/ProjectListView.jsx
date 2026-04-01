import { useState, Fragment } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { createTask, createSubtask } from '../../store/slices/taskSlice';
import { fetchLists } from '../../store/slices/boardSlice';
import { useRole } from '../../hooks/useRole';

function ProjectListView({ lists, boardId, onTaskClick }) {
  const dispatch = useAppDispatch();
  const { canEdit } = useRole();

  const [collapsedSections, setCollapsedSections] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});
  const [addingTaskTo, setAddingTaskTo] = useState(null);       // listId
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null); // { listId, taskId }
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const toggleSection = (listId) => {
    setCollapsedSections(prev => ({ ...prev, [listId]: !prev[listId] }));
  };

  const toggleTask = (taskId, e) => {
    e.stopPropagation();
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const refetchLists = () => {
    if (boardId) dispatch(fetchLists(boardId));
  };

  const handleAddTask = (e, listId) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    dispatch(createTask({ listId, taskData: { title: newTaskTitle } })).then(() => {
      setNewTaskTitle('');
      setAddingTaskTo(null);
      refetchLists();
    });
  };

  const handleAddSubtask = (e, listId, taskId) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    dispatch(createSubtask({ listId, taskId, subtaskData: { title: newSubtaskTitle } })).then(() => {
      setNewSubtaskTitle('');
      setAddingSubtaskTo(null);
      setExpandedTasks(prev => ({ ...prev, [taskId]: true }));
      refetchLists();
    });
  };

  return (
    <div className="bg-[var(--asana-surface)] rounded-lg border border-[var(--asana-border)] overflow-hidden">
      {/* ── Column headers (like real Asana) ── */}
      <div className="flex items-center border-b border-[var(--asana-border)] bg-[var(--asana-surface)] sticky top-0 z-10">
        <div className="flex-1 min-w-0 px-6 py-2">
          <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)] uppercase tracking-wider">Name</span>
        </div>
        <div className="w-[120px] px-3 py-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)] uppercase tracking-wider">Assignee</span>
        </div>
        <div className="w-[120px] px-3 py-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-[var(--asana-text-secondary)] uppercase tracking-wider">Due date</span>
        </div>
      </div>

      {/* ── Sections ── */}
      {lists.map((list) => (
        <Fragment key={list.id}>
          {/* Section header */}
          <div
            className="flex items-center px-4 py-2 cursor-pointer border-b border-[var(--asana-border)] hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group"
            onClick={() => toggleSection(list.id)}
          >
            <svg
              className={`w-3 h-3 text-[var(--asana-text-secondary)] mr-2 transition-transform flex-shrink-0 ${collapsedSections[list.id] ? '-rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-sm font-bold text-[var(--asana-text-primary)]">{list.name}</span>
            <span className="ml-2 text-[10px] text-[var(--asana-text-secondary)] bg-gray-200/80 dark:bg-gray-700 rounded-full px-1.5 py-0.5 font-medium">
              {list.tasks?.length || 0}
            </span>
          </div>

          {/* Tasks */}
          {!collapsedSections[list.id] && (
            <>
              {list.tasks?.map((task) => {
                const hasSubtasks = task.subtasks?.length > 0;
                const isExpanded = expandedTasks[task.id];

                return (
                  <Fragment key={task.id}>
                    {/* ── Task row ── */}
                    <div
                      className="flex items-center border-b border-[var(--asana-border)] hover:bg-gray-50/80 dark:hover:bg-gray-800/20 cursor-pointer group transition-colors"
                      onClick={() => onTaskClick(task.id)}
                    >
                      {/* Name column */}
                      <div className="flex-1 min-w-0 flex items-center px-6 py-[7px]">
                        {/* Expand toggle (only if has subtasks) */}
                        {hasSubtasks ? (
                          <button
                            onClick={(e) => toggleTask(task.id, e)}
                            className="mr-1.5 p-0.5 -ml-5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                          >
                            <svg
                              className={`w-3 h-3 text-[var(--asana-text-secondary)] transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        ) : (
                          <span className="w-4 mr-1.5 flex-shrink-0" />
                        )}

                        {/* Check circle */}
                        <div className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${
                          task.status === 'DONE'
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 dark:border-gray-600 group-hover:border-green-400'
                        }`}>
                          {task.status === 'DONE' && (
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>

                        {/* Task title */}
                        <span className={`text-sm truncate ${
                          task.status === 'DONE'
                            ? 'line-through text-[var(--asana-text-secondary)]'
                            : 'text-[var(--asana-text-primary)]'
                        }`}>
                          {task.title}
                        </span>

                        {/* Subtask count badge */}
                        {hasSubtasks && (
                          <span
                            className="ml-2 text-[10px] text-[var(--asana-text-secondary)] flex items-center flex-shrink-0 cursor-pointer"
                            onClick={(e) => toggleTask(task.id, e)}
                          >
                            {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
                            <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </span>
                        )}
                      </div>

                      {/* Assignee column */}
                      <div className="w-[120px] px-3 py-[7px] flex-shrink-0">
                        {task.assignees?.length > 0 ? (
                          <div className="flex -space-x-1">
                            {task.assignees.slice(0, 2).map((a) => (
                              <div
                                key={a.user.id}
                                className="w-6 h-6 rounded-full border-2 border-[var(--asana-surface)] flex items-center justify-center text-white text-[9px] font-bold"
                                style={{ backgroundColor: '#4573D2' }}
                                title={a.user.name}
                              >
                                {a.user.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Due date column */}
                      <div className="w-[120px] px-3 py-[7px] flex-shrink-0">
                        {task.dueDate ? (
                          <span className={`text-xs ${new Date(task.dueDate) < new Date() ? 'text-red-500 font-medium' : 'text-[var(--asana-text-secondary)]'}`}>
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Subtask rows (indented, shown when expanded) ── */}
                    {isExpanded && task.subtasks?.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center border-b border-[var(--asana-border)] hover:bg-gray-50/80 dark:hover:bg-gray-800/20 cursor-pointer group transition-colors"
                        onClick={() => onTaskClick(sub.id)}
                      >
                        <div className="flex-1 min-w-0 flex items-center pl-14 pr-6 py-[7px]">
                          {/* Check circle */}
                          <div className={`w-[16px] h-[16px] rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-3 transition-colors ${
                            sub.status === 'DONE'
                              ? 'border-green-500 bg-green-500'
                              : 'border-gray-300 dark:border-gray-600 group-hover:border-green-400'
                          }`}>
                            {sub.status === 'DONE' && (
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm truncate ${
                            sub.status === 'DONE'
                              ? 'line-through text-[var(--asana-text-secondary)]'
                              : 'text-[var(--asana-text-primary)]'
                          }`}>
                            {sub.title}
                          </span>
                        </div>

                        {/* Assignee */}
                        <div className="w-[120px] px-3 py-[7px] flex-shrink-0">
                          {sub.assignees?.length > 0 ? (
                            <div
                              className="w-6 h-6 rounded-full border-2 border-[var(--asana-surface)] flex items-center justify-center text-white text-[9px] font-bold"
                              style={{ backgroundColor: '#4573D2' }}
                              title={sub.assignees[0].user.name}
                            >
                              {sub.assignees[0].user.name.charAt(0).toUpperCase()}
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-3 h-3 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Due date */}
                        <div className="w-[120px] px-3 py-[7px] flex-shrink-0">
                          {sub.dueDate ? (
                            <span className={`text-xs ${new Date(sub.dueDate) < new Date() ? 'text-red-500' : 'text-[var(--asana-text-secondary)]'}`}>
                              {new Date(sub.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          ) : (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-4 h-4 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add subtask row (shown when task is expanded) */}
                    {isExpanded && canEdit && (
                      <div className="border-b border-[var(--asana-border)]">
                        {addingSubtaskTo?.taskId === task.id ? (
                          <form
                            onSubmit={(e) => handleAddSubtask(e, list.id, task.id)}
                            className="flex items-center pl-14 pr-6 py-[6px]"
                          >
                            <div className="w-[16px] h-[16px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
                            <input
                              type="text"
                              value={newSubtaskTitle}
                              onChange={(e) => setNewSubtaskTitle(e.target.value)}
                              placeholder="Add subtask..."
                              className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') { setAddingSubtaskTo(null); setNewSubtaskTitle(''); }
                              }}
                              onBlur={() => { if (!newSubtaskTitle.trim()) { setAddingSubtaskTo(null); setNewSubtaskTitle(''); } }}
                            />
                          </form>
                        ) : (
                          <button
                            onClick={() => setAddingSubtaskTo({ listId: list.id, taskId: task.id })}
                            className="flex items-center pl-14 pr-6 py-[6px] w-full text-left text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors"
                          >
                            <span>Add subtask...</span>
                          </button>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}

              {/* ── Add task row ── */}
              {canEdit && (
                <div className="border-b border-[var(--asana-border)]">
                  {addingTaskTo === list.id ? (
                    <form
                      onSubmit={(e) => handleAddTask(e, list.id)}
                      className="flex items-center px-6 py-[7px]"
                    >
                      <span className="w-4 mr-1.5 flex-shrink-0" />
                      <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 dark:border-gray-700 flex-shrink-0 mr-3" />
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Write a task name..."
                        className="flex-1 text-sm bg-transparent border-none outline-none text-[var(--asana-text-primary)] placeholder-gray-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setAddingTaskTo(null); setNewTaskTitle(''); }
                        }}
                        onBlur={() => { if (!newTaskTitle.trim()) { setAddingTaskTo(null); setNewTaskTitle(''); } }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => { setAddingTaskTo(list.id); setNewTaskTitle(''); }}
                      className="flex items-center px-6 py-[7px] w-full text-left text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add task...</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </Fragment>
      ))}

      {/* ── Add section ── */}
      {canEdit && (
        <div className="px-4 py-2">
          <button className="flex items-center text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors">
            <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add section</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ProjectListView;
