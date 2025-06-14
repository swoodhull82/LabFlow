
'use client';
import type { CalendarEvent, Task, TaskStatus } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const TASK_COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

const pbTaskToCalendarEvent = (taskRecord: any): CalendarEvent => {
  const task = taskRecord as Task; 

  return {
    id: task.id,
    title: task.title,
    eventDate: task.dueDate ? new Date(task.dueDate) : new Date(), 
    description: task.description,
    status: task.status as TaskStatus, 
    userId: task.userId, 
    created: task.created ? new Date(task.created) : new Date(),
    updated: task.updated ? new Date(task.updated) : new Date(),
    collectionId: task.collectionId,
    collectionName: task.collectionName, 
    expand: task.expand,
  };
};

export const getCalendarEvents = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<CalendarEvent[]> => {
  try {
    const { signal, ...otherOptions } = options || {};
    const defaultFields = 'id,title,dueDate,description,status,userId,created,updated';
    const requestParams = {
      filter: 'dueDate != null && dueDate != ""', 
      sort: '-dueDate', 
      fields: defaultFields,
      ...otherOptions, // Allow overriding filter, sort, and fields if provided in options
    };

    const records = await withRetry(() => 
      pb.collection(TASK_COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching tasks for calendar" }
    );
    return records.map(pbTaskToCalendarEvent).filter(event => event.eventDate); 
  } catch (error) {
    throw error;
  }
};

