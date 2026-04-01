import { useState, Fragment } from 'react';

const PRIORITY_STYLE = {
  HIGH: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  MEDIUM: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400',
  LOW: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
};

function ProjectListView({ lists, onTaskClick }) {
  const [collapsedLists, setCollapsedLists] = useState({});

  const toggleList = (listId) => {
    setCollapsedLists(prev => ({ ...prev, [listId]: !prev[listId] }));
  };

  return (
    <div className="bg-[var(--asana-surface)] rounded-asana border border-[var(--asana-border)] overflow-hidden">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--asana-border)] bg-gray-50 dark:bg-gray-800/50">
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider w-1/2">Task Name</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Assignee</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Due Date</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Priority</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[var(--asana-text-secondary)] uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => (
            <Fragment key={list.id}>
              {/* Section header */}
              <tr
                className="bg-gray-50/80 dark:bg-gray-800/30 cursor-pointer border-b border-[var(--asana-border)] hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors"
                onClick={() => toggleList(list.id)}
              >
                <td colSpan={5} className="px-4 py-2">
                  <div className="flex items-center space-x-2">
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--asana-text-secondary)] transition-transform ${collapsedLists[list.id] ? '-rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="text-xs font-bold text-[var(--asana-text-primary)] uppercase tracking-wide">{list.name}</span>
                    <span className="text-[10px] text-[var(--asana-text-secondary)] bg-gray-200 dark:bg-gray-700 rounded-full px-1.5 py-0.5">
                      {list.tasks?.length || 0}
                    </span>
                  </div>
                </td>
              </tr>

              {/* Task rows */}
              {!collapsedLists[list.id] && list.tasks?.map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-[var(--asana-border)] hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer group transition-colors"
                  onClick={() => onTaskClick(task.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        task.status === 'DONE' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 group-hover:border-asana-blue'
                      }`}>
                        {task.status === 'DONE' && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${task.status === 'DONE' ? 'line-through text-[var(--asana-text-secondary)]' : 'text-[var(--asana-text-primary)]'}`}>
                        {task.title}
                      </span>
                      {task.subtasks?.length > 0 && (
                        <span className="text-[10px] text-[var(--asana-text-secondary)] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full ml-1">
                          {task.subtasks.filter(s => s.status === 'DONE').length}/{task.subtasks.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {task.assignees?.length > 0 ? (
                      <div className="flex -space-x-1">
                        {task.assignees.slice(0, 3).map((a) => (
                          <div key={a.user.id} className="w-6 h-6 rounded-full border-2 border-[var(--asana-surface)] flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: '#4573D2' }} title={a.user.name}>
                            {a.user.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                        <svg className="w-3 h-3 text-[var(--asana-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {task.dueDate ? (
                      <span className={`text-xs ${new Date(task.dueDate) < new Date() ? 'text-red-500 font-medium' : 'text-[var(--asana-text-secondary)]'}`}>
                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--asana-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${PRIORITY_STYLE[task.priority] || 'text-gray-500 bg-gray-100 dark:bg-gray-700'}`}>
                      {task.priority || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      task.status === 'DONE' ? 'text-green-600 dark:text-green-400' :
                      task.status === 'IN_PROGRESS' ? 'text-asana-blue' :
                      task.status === 'REVIEW' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-[var(--asana-text-secondary)]'
                    }`}>
                      {task.status?.replace('_', ' ') || '—'}
                    </span>
                  </td>
                </tr>
              ))}

              {/* Quick add row */}
              {!collapsedLists[list.id] && (
                <tr className="border-b border-[var(--asana-border)]">
                  <td colSpan={5} className="px-4 py-2">
                    <button className="flex items-center text-[var(--asana-text-secondary)] hover:text-asana-blue text-xs transition-colors space-x-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add task</span>
                    </button>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ProjectListView;
