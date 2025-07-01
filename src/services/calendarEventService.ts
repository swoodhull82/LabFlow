
'use client';
import type { CalendarEvent, Task, TaskStatus, TaskRecurrence } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';
import { generateProjectedTasks } from '@/lib/recurrence';

const TASK_COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

const pbTaskToCalendarEvent = (taskRecord: Task): CalendarEvent => {
  return {
    id: taskRecord.id,
    title: taskRecord.title,
    eventDate: taskRecord.dueDate ? new Date(taskRecord.dueDate) : new Date(), 
    description: taskRecord.description,
    status: taskRecord.status as TaskStatus, 
    userId: taskRecord.userId, 
    created: taskRecord.created ? new Date(taskRecord.created) : new Date(),
    updated: taskRecord.updated ? new Date(taskRecord.updated) : new Date(),
    collectionId: taskRecord.collectionId,
    collectionName: taskRecord.collectionName, 
    expand: taskRecord.expand,
    assignedTo_text: taskRecord.assignedTo_text,
    priority: taskRecord.priority,
    progress: taskRecord.progress,
  };
};

const pbRecordToTask = (record: any): Task => {
  return {
    id: record.id,
    title: record.title || "",
    task_type: record.task_type,
    description: record.description,
    status: record.status,
    priority: record.priority,
    startDate: record.startDate ? new Date(record.startDate) : undefined,
    dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    assignedTo_text: record.assignedTo_text,
    recurrence: (record.recurrence as TaskRecurrence) || "None",
    attachments: record.attachments,
    userId: record.userId,
    created: new Date(record.created),
    updated: new Date(record.updated),
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    expand: record.expand,
    progress: record.progress,
    isMilestone: typeof record.isMilestone === 'boolean' ? record.isMilestone : false,
    dependencies: Array.isArray(record.dependencies) ? record.dependencies : (typeof record.dependencies === 'string' && record.dependencies.startsWith('[') ? JSON.parse(record.dependencies) : []),
    instrument_subtype: record.instrument_subtype || undefined,
    method: record.method || undefined,
  } as Task;
};


export const getCalendarEvents = async (pb: PocketBase, options?: PocketBaseRequestOptions & { projectionHorizon?: Date }): Promise<CalendarEvent[]> => {
  try {
    const { signal, projectionHorizon, ...otherOptions } = options || {};
    const defaultFields = 'id,title,task_type,dueDate,description,status,userId,created,updated,recurrence,startDate,priority,progress,isMilestone,dependencies,instrument_subtype,method,assignedTo_text';
    const requestParams = {
      filter: 'dueDate != null && dueDate != ""', 
      sort: '-dueDate', 
      fields: defaultFields,
      ...otherOptions,
    };

    const records = await withRetry(() => 
      pb.collection(TASK_COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching tasks for calendar" }
    );
    
    const rawTasks = records.map(pbRecordToTask);
    const allTasks = projectionHorizon ? generateProjectedTasks(rawTasks, projectionHorizon) : rawTasks;

    return allTasks.map(pbTaskToCalendarEvent).filter(event => event.eventDate); 
  } catch (error) {
    throw error;
  }
};
