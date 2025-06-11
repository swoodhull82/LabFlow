
'use client';
import type { CalendarEvent, Task, TaskStatus } from "@/lib/types";
import type PocketBase from 'pocketbase';

const TASK_COLLECTION_NAME = "tasks";

// Helper to convert a Task record from PocketBase to a CalendarEvent type
const pbTaskToCalendarEvent = (taskRecord: any): CalendarEvent => {
  // Ensure taskRecord is treated as a Task-like structure
  const task = taskRecord as Task; 

  return {
    id: task.id,
    title: task.title,
    eventDate: task.dueDate ? new Date(task.dueDate) : new Date(), // Default to now if dueDate is missing, though filter should prevent this
    description: task.description,
    status: task.status as TaskStatus, // Map the status
    userId: task.userId, // The user who created the task
    created: task.created ? new Date(task.created) : new Date(),
    updated: task.updated ? new Date(task.updated) : new Date(),
    collectionId: task.collectionId,
    collectionName: task.collectionName, // This will be 'tasks'
    expand: task.expand,
  };
};

export const getCalendarEvents = async (pb: PocketBase): Promise<CalendarEvent[]> => {
  try {
    // Fetch tasks that have a due date
    const records = await pb.collection(TASK_COLLECTION_NAME).getFullList({
      filter: 'dueDate != null && dueDate != ""', // Filter for tasks with a non-empty dueDate
      sort: '-dueDate', // Sort by due date
    });
    // Map task records to CalendarEvent objects
    return records.map(pbTaskToCalendarEvent).filter(event => event.eventDate); // Ensure eventDate is valid
  } catch (error) {
    console.error("Failed to fetch tasks for calendar view:", error);
    throw error;
  }
};

// Optional: Add create, update, delete functions for calendar events if needed later
// These would likely operate on the tasks collection if events are derived from tasks
// or a separate collection if manual calendar events are re-introduced.
// export const createCalendarEvent = async (pb: PocketBase, eventData: Partial<Omit<CalendarEvent, 'id' | 'created' | 'updated'>>): Promise<CalendarEvent> => { ... }
// export const updateCalendarEvent = async (pb: PocketBase, id: string, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => { ... }
// export const deleteCalendarEvent = async (pb: PocketBase, id: string): Promise<void> => { ... }


