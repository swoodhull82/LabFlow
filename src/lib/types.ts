
export type UserRole = "Supervisor" | "Team Lead" | "Chem I" | "Chem II";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  avatarUrl?: string | null;
  lucideIconComponent?: React.ElementType; // To store the Lucide icon component
  selected_lucide_icon?: string; // Stores the name of the user-selected Lucide icon
  sharesPersonalCalendarWith?: string[];
}

export type TaskType = "MDL" | "SOP" | "IA" | "iDOC" | "oDOC" | "VALIDATION_PROJECT" | "VALIDATION_STEP";
export type TaskStatus = "To Do" | "In Progress" | "Blocked" | "Done" | "Overdue";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskRecurrence = "None" | "Daily" | "Weekly" | "Monthly" | "Yearly";
export type PersonalEventType = 'Available' | 'Busy' | 'Out of Office';

export interface Task {
  id: string;
  title: string; 
  task_type: TaskType; 
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date | string;
  dueDate?: Date | string;
  assignedTo?: string[]; // Array of employee IDs
  recurrence: TaskRecurrence;
  attachments?: File[] | string[];
  userId: string;
  created: Date | string;
  updated: Date | string;
  collectionId?: string;
  collectionName?: string;
  expand?: {
    assignedTo?: Employee[];
    [key: string]: any;
  };
  progress?: number; 
  isMilestone?: boolean; 
  dependencies?: string[]; 
  instrument_subtype?: string; 
  method?: string; // Added new method field
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  task_type?: TaskType;
  description?: string;
  status?: TaskStatus; 
  userId?: string; 
  created: Date | string;
  updated: Date | string;
  collectionId?: string;
  collectionName?: string; 
  expand?: {
    assignedTo?: Employee[];
    [key: string]: any;
  };
  assignedTo?: string[];
  priority?: TaskPriority;
  progress?: number;
  isAllDay?: boolean;
  eventType?: PersonalEventType;
  ownerId?: string;
  ownerName?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: string; 
  reportsTo_text?: string;
  department_text?: string;
  userId?: string; 
  created?: Date | string;
  updated?: Date | string;
  collectionId?: string;
  collectionName?: string;
  expand?: any;
}

export interface ActivityLogEntry {
  id: string;
  user_name: string; 
  action: string; 
  details?: string; 
  created: Date | string; 
  updated: Date | string;
}

// Kanban Types
export interface KanbanStatus {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface KanbanGroup {
  id: string;
  name: string;
  order: number;
}

export interface KanbanStep {
  id: string;
  card: string; // Relation to kanban_cards
  name: string;
  completed: boolean;
  assignees: string[]; // Relation to employees
  order: number;
}

export interface KanbanCard {
  id: string;
  name: string;
  status: string; // Relation to kanban_statuses
  group: string; // Relation to kanban_groups
  owners: string[]; // Relation to employees
  createdBy: string; // Relation to users
  startAt?: Date | string;
  endAt?: Date | string;
  order: number;
  created: Date | string;
  updated: Date | string;
  steps: KanbanStep[]; // Populated via expand or separate query
  expand?: {
    'kanban_steps(card)': KanbanStep[];
    owners?: Employee[]; // Changed from User[]
    createdBy?: User;
    status?: KanbanStatus;
    group?: KanbanGroup;
  }
}
