
import type { TaskStatus, TaskPriority, TaskRecurrence } from "./types";

export const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "Blocked", "Done", "Overdue"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_RECURRENCES: TaskRecurrence[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

export const APP_NAME = "LabFlow";

export const PREDEFINED_TASK_TITLES: readonly string[] = ["MDL", "SOP", "IA", "iDOC", "oDOC"];
export const INSTRUMENT_SUBTYPES: readonly string[] = ["nexiON", "agilent 7900", "DMA-80 Mercury Analyzer"];

const generateSopSubtypes = (): string[] => {
  const subtypes: string[] = [];
  // BOL5000 to BOL5016
  for (let i = 0; i <= 16; i++) {
    subtypes.push(`BOL50${String(i).padStart(2, '0')}`);
  }
  // BOL5018 to BOL5024
  for (let i = 18; i <= 24; i++) {
    subtypes.push(`BOL50${String(i).padStart(2, '0')}`);
  }
  // BOL5026 to BOL5028
  for (let i = 26; i <= 28; i++) {
    subtypes.push(`BOL50${String(i).padStart(2, '0')}`);
  }
  // BOL5500 to BOL5502
  for (let i = 0; i <= 2; i++) {
    subtypes.push(`BOL55${String(i).padStart(2, '0')}`);
  }
  return subtypes;
};

export const SOP_SUBTYPES: readonly string[] = generateSopSubtypes();

