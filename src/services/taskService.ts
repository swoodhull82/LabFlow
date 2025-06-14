
'use client';
import type { Task, TaskType } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  onRetry?: (attempt: number, maxAttempts: number, error: any) => void; 
  [key: string]: any; 
}

// Helper to convert PocketBase record to Task type
const pbRecordToTask = (record: any): Task => {
  return {
    ...record,
    task_type: record.task_type as TaskType,
    title: record.title || "", 
    startDate: record.startDate ? new Date(record.startDate) : undefined,
    dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    created: new Date(record.created), 
    updated: new Date(record.updated),
    dependencies: Array.isArray(record.dependencies) ? record.dependencies : (typeof record.dependencies === 'string' && record.dependencies.startsWith('[') ? JSON.parse(record.dependencies) : []), 
    isMilestone: typeof record.isMilestone === 'boolean' ? record.isMilestone : false,
    instrument_subtype: record.instrument_subtype || undefined,
  } as Task;
};

const DEFAULT_TASK_LIST_FIELDS = 'id,title,task_type,status,priority,startDate,dueDate,assignedTo_text,userId,created,updated,progress,isMilestone,dependencies,instrument_subtype';
const DEFAULT_TASK_DETAIL_FIELDS = 'id,title,task_type,description,status,priority,startDate,dueDate,assignedTo_text,userId,created,updated,progress,isMilestone,dependencies,attachments,instrument_subtype';


export const getTasks = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<Task[]> => {
  try {
    const { onRetry, signal, ...otherOptions } = options || {}; 
    const requestParams = {
      sort: '-created',
      fields: DEFAULT_TASK_LIST_FIELDS,
      ...otherOptions, 
    };
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      {
        signal, 
        context: "fetching tasks list",
        onRetry 
      }
    );
    return records.map(pbRecordToTask);
  } catch (error) {
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<Task | null> => {
  try {
    const { onRetry, signal, ...otherOptions } = options || {}; 
    const requestParams = {
      fields: DEFAULT_TASK_DETAIL_FIELDS,
      ...otherOptions,
    };
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id, requestParams, { signal }),
    {
      signal,
      context: `fetching task by ID ${id}`,
      onRetry 
    });
    return pbRecordToTask(record);
  } catch (error) {
    if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};

export const createTask = async (pb: PocketBase, taskData: FormData, options?: PocketBaseRequestOptions): Promise<Task> => {
  try {
    if (taskData.has('isMilestone')) {
      taskData.set('isMilestone', taskData.get('isMilestone') === 'true' ? 'true' : 'false');
    }
    
    const record = await pb.collection(COLLECTION_NAME).create(taskData, { signal: options?.signal });
    return pbRecordToTask(record);
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
};

export const updateTask = async (pb: PocketBase, id: string, taskData: FormData | Partial<Task>, options?: PocketBaseRequestOptions): Promise<Task> => {
  try {
    const { signal } = options || {};
    if (taskData instanceof FormData && taskData.has('isMilestone')) {
      taskData.set('isMilestone', taskData.get('isMilestone') === 'true' || taskData.get('isMilestone') === true ? 'true' : 'false');
    } else if (!(taskData instanceof FormData) && taskData.hasOwnProperty('isMilestone')) {
      taskData.isMilestone = !!taskData.isMilestone;
    }
    
    const record = await withRetry(() =>
      pb.collection(COLLECTION_NAME).update(id, taskData, { signal }),
      { context: `updating task ${id}`, signal }
    );
    return pbRecordToTask(record);
  } catch (error) {
    console.error(`Failed to update task ${id}:`, error);
    throw error;
  }
};

export const deleteTask = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<void> => {
  try {
    const { signal } = options || {};
    await withRetry(() =>
      pb.collection(COLLECTION_NAME).delete(id, { signal }),
      { context: `deleting task ${id}`, signal }
    );
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);
    throw error;
  }
};
