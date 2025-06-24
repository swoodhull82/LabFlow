
import type { Task } from './types';
import { addYears, addMonths, addWeeks, addDays, isBefore } from 'date-fns';

/**
 * Generates projected instances of recurring tasks up to a given horizon date.
 * @param tasks An array of original tasks.
 * @param horizonDate The date to project tasks up to.
 * @returns An array containing original tasks and their projected future instances.
 */
export function generateProjectedTasks(tasks: Task[], horizonDate: Date): Task[] {
  const allTasks: Task[] = [];

  tasks.forEach(originalTask => {
    // Always include the original task itself
    allTasks.push(originalTask);

    if (originalTask.recurrence === 'None' || !originalTask.dueDate) {
      return;
    }

    let nextDueDate = new Date(originalTask.dueDate);
    const originalDuration = originalTask.startDate ? new Date(originalTask.dueDate).getTime() - new Date(originalTask.startDate).getTime() : 0;
    
    let i = 1; // projection index

    while (true) {
      const lastDueDate = new Date(nextDueDate);
      switch (originalTask.recurrence) {
        case 'Daily':
          nextDueDate = addDays(lastDueDate, 1);
          break;
        case 'Weekly':
          nextDueDate = addWeeks(lastDueDate, 1);
          break;
        case 'Monthly':
          nextDueDate = addMonths(lastDueDate, 1);
          break;
        case 'Yearly':
          nextDueDate = addYears(lastDueDate, 1);
          break;
        default:
          return; // Exit for 'None' or unknown recurrence
      }

      if (isBefore(nextDueDate, horizonDate)) {
        const newStartDate = originalTask.startDate ? new Date(nextDueDate.getTime() - originalDuration) : undefined;
        
        const projectedTask: Task = {
          ...originalTask,
          id: `${originalTask.id}_proj_${i}`,
          dueDate: nextDueDate,
          startDate: newStartDate,
          status: 'To Do', // All projected tasks are To Do by default
          progress: 0,
          // Clear fields that are instance-specific
          attachments: [],
          description: `Recurring instance of: ${originalTask.title}. Original due date: ${new Date(originalTask.dueDate).toLocaleDateString()}`,
        };
        allTasks.push(projectedTask);
        i++;
      } else {
        break; // Stop projecting when we go past the horizon
      }
    }
  });

  return allTasks;
}
