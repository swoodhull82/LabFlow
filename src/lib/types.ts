
export type UserRole = "Supervisor" | "Team Lead" | "Chem I" | "Chem II";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  avatarUrl?: string | null;
  lucideIconComponent?: React.ElementType; // To store the Lucide icon component
  selected_lucide_icon?: string; // Stores the name of the user-selected Lucide icon
}

export type TaskType = "MDL" | "SOP" | "IA" | "iDOC" | "oDOC" | "VALIDATION_PROJECT";
export type TaskStatus = "To Do" | "In Progress" | "Blocked" | "Done" | "Overdue";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskRecurrence = "None" | "Daily" | "Weekly" | "Monthly" | "Yearly";

export interface Task {
  id: string;
  title: string; // User-defined name for the task/project
  task_type: TaskType; // The specific type of task
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date | string;
  dueDate?: Date | string;
  assignedTo_text?: string;
  recurrence: TaskRecurrence;
  attachments?: File[] | string[];
  userId: string;
  created: Date | string;
  updated: Date | string;
  collectionId?: string;
  collectionName?: string;
  expand?: any;
  progress?: number; // Percentage 0-100
  isMilestone?: boolean; // Applicable if task_type is VALIDATION_PROJECT
  dependencies?: string[]; // Array of task IDs, applicable if task_type is VALIDATION_PROJECT
  instrument_subtype?: string; // Applicable if task_type is MDL or SOP
  steps?: string[]; // Array of step descriptions, applicable if task_type is VALIDATION_PROJECT
}

export interface CalendarEvent {
  id: string;
  title: string;
  eventDate: Date | string; // Date of the event
  description?: string;
  status?: TaskStatus; // Added status for tasks displayed on calendar
  userId?: string; // Optional: if events are user-specific
  created: Date | string;
  updated: Date | string;
  collectionId?: string;
  collectionName?: string;
  expand?: any;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string; // This can be general role description, not necessarily UserRole
  reportsTo_text?: string;
  department_text?: string;
  userId?: string; // Optional: if employee is also a system user
  created?: Date | string;
  updated?: Date | string;
  collectionId?: string;
  collectionName?: string;
  expand?: any;
}

export interface ActivityLogEntry {
  id: string;
  user_name: string; // Name of the user who performed the action
  action: string; // Description of the action, e.g., "Created new task"
  details?: string; // Optional additional details about the event
  created: Date | string; // Timestamp of the event
  updated: Date | string;
}
