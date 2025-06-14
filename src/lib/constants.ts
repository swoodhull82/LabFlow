
import type { TaskStatus, TaskPriority, TaskRecurrence } from "./types";

export const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "Blocked", "Done", "Overdue"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_RECURRENCES: TaskRecurrence[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

export const APP_NAME = "LabFlow";

export const PREDEFINED_TASK_TITLES: readonly string[] = ["MDL", "SOP", "IA", "iDOC", "oDOC"];
export const INSTRUMENT_SUBTYPES: readonly string[] = ["nexiON", "agilent 7900", "DMA-80 Mercury Analyzer"];
