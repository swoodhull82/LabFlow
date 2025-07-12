
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

const pbTaskToCalendarEvent = (taskRecord: any): CalendarEvent => {
  return {
    id: taskRecord.id,
    title: taskRecord.title,
    startDate: taskRecord.startDate!,
    endDate: taskRecord.dueDate!,
    description: taskRecord.description,
    status: taskRecord.status as TaskStatus, 
    userId: taskRecord.userId, 
    task_type: taskRecord.task_type,
    created: taskRecord.created ? new Date(taskRecord.created) : new Date(),
    updated: taskRecord.updated ? new Date(taskRecord.updated) : new Date(),
    collectionId: taskRecord.collectionId,
    collectionName: taskRecord.collectionName, 
    expand: taskRecord.expand,
    assignedTo: taskRecord.assignedTo,
    priority: taskRecord.priority,
    progress: taskRecord.progress,
    recurrence: taskRecord.recurrence || 'None',
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
    assignedTo: record.assignedTo || [],
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
    const defaultFields = 'id,title,task_type,dueDate,description,status,userId,created,updated,recurrence,startDate,priority,progress,isMilestone,dependencies,instrument_subtype,method,assignedTo';
    const requestParams = {
      filter: 'startDate != null && startDate != "" && dueDate != null && dueDate != ""', 
      sort: '-dueDate', 
      fields: defaultFields,
      expand: 'assignedTo',
      ...otherOptions,
    };

    const records = await withRetry(() => 
      pb.collection(TASK_COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching tasks for calendar" }
    );
    
    const rawTasks = records.map(pbRecordToTask);
    const allTasks = projectionHorizon ? generateProjectedTasks(rawTasks, projectionHorizon) : rawTasks;

    return allTasks.map(pbTaskToCalendarEvent).filter(event => event.startDate && event.endDate); 
  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    console.error("Failed to fetch calendar events:", error);
    throw error;
  }
};
