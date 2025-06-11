
import type { TaskStatus, TaskPriority, TaskRecurrence } from "./types";

export const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "Blocked", "Done", "Overdue"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_RECURRENCES: TaskRecurrence[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

export const APP_NAME = "LabFlow";
