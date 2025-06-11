
export type UserRole = "Supervisor" | "Analyst";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  avatarUrl?: string;
}

export type TaskStatus = "To Do" | "In Progress" | "Blocked" | "Done" | "Overdue";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskRecurrence = "None" | "Daily" | "Weekly" | "Monthly" | "Yearly";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
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
}

export interface CalendarEvent {
  id: string;
  title: string;
  eventDate: Date | string; // Date of the event
  description?: string;
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

