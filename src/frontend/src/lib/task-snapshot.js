/** Ignore delayed IPC replies after a newer push has already been applied. */
export function applyTaskSnapshot(current, snapshot) {
  if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !Array.isArray(snapshot.tasks)) {
    throw new Error('Invalid task snapshot');
  }
  if (snapshot.revision <= current.revision) return current;
  const ids = new Set();
  for (const task of snapshot.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)) throw new Error('Invalid task snapshot');
    ids.add(task.id);
  }
  const tasks = Object.fromEntries(snapshot.tasks.map(task => [task.id, task]));
  return {revision: snapshot.revision, tasks,
    selectedTask: current.selectedTask && Object.hasOwn(tasks, current.selectedTask) ? current.selectedTask : null};
}
