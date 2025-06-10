
export type UserRole = "admin" | "employee";

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
  dueDate?: Date | string; // Allow string for PB, convert to Date on client
  assignedTo_text?: string; // Store assigned user's name as text for now
  recurrence: TaskRecurrence;
  attachments?: File[] | string[]; // File list for client, string array for PB URLs
  userId: string; // ID of the user who created the task
  created: Date | string;
  updated: Date | string;
  // PocketBase specific fields we might get
  collectionId?: string;
  collectionName?: string;
  expand?: any;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string; // e.g., 'Lab Technician', 'Researcher'
  hireDate: Date;
  userId: string; // Link to User account
}
