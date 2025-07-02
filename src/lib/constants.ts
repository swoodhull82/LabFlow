
import type { TaskStatus, TaskPriority, TaskRecurrence, TaskType, PersonalEventType } from "./types";

export const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "Blocked", "Done", "Overdue"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
export const TASK_RECURRENCES: TaskRecurrence[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];
export const PERSONAL_EVENT_TYPES: PersonalEventType[] = ["Busy", "Out of Office"];

export const APP_NAME = "LabFlow";

export const TASK_TYPES: readonly TaskType[] = ["MDL", "SOP", "IA", "iDOC", "oDOC", "VALIDATION_PROJECT", "VALIDATION_STEP"];

export const MDL_INSTRUMENTS_WITH_METHODS: Record<string, readonly string[]> = {
  "Hydra AA": ["Mercury by EPA 245.1", "Mercury by EPA 7471B & 7470A"],
  "Hydra II": ["Mercury by EPA 245.1", "Mercury by EPA 7471B & 7470A"],
  "PE Optima 5300V": ["Metals by EPA 200.7"],
  "PE Optima 8300": ["Metals by EPA 200.7"],
  "iCAP 7400 DUO": ["Metals by EPA 200.7"],
  "PE Optima 7300V": ["Metals by EPA 200.7"],
  "PE Elan 9000": ["Metals by EPA 200.8"],
  "Agilent 7900": ["Metals by EPA 200.8"],
  "PE NexION 300X": [],
  "PE NexION 300D": [],
};

export const INSTRUMENT_SUBTYPES: readonly string[] = Object.keys(MDL_INSTRUMENTS_WITH_METHODS);


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
