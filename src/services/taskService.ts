
'use client';
import type { Task, TaskType, TaskRecurrence } from "@/lib/types"; // Added TaskRecurrence import
import PocketBase, { ClientResponseError } from 'pocketbase';
import { withRetry } from '@/lib/retry';
import { generateProjectedTasks } from '@/lib/recurrence';

const COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  onRetry?: (attempt: number, maxAttempts: number, error: any) => void;
  [key: string]: any;
}

// Helper to handle common creation errors from PocketBase
const handleCreateError = (error: any, collectionName: string) => {
    if (error instanceof ClientResponseError) {
        if (error.status === 404) {
            throw new Error(`Cannot create item: The '${collectionName}' collection does not exist. Please create it in your PocketBase admin panel.`);
        }
        if (error.status === 400 && error.data?.data) {
            // Specific check for the "id" field misconfiguration
            if (error.data.data.id && error.data.data.id.message) {
                 throw new Error(`There seems to be a configuration issue with your '${collectionName}' collection. The server is asking for an 'id', which should be automatically generated. Please check in your PocketBase admin panel that the 'id' field is the default system field and not a required text field you created.`);
            }
            // Generic validation error message
            const fieldErrors = Object.entries(error.data.data)
                .map(([key, val]: [string, any]) => `${key}: ${val.message}`)
                .join('; ');
            throw new Error(`Validation failed. Server says: ${fieldErrors}`);
        }
    }
    console.error(`Failed to create item in ${collectionName}:`, error);
    // Fallback for other errors
    throw error;
};

// Helper to convert PocketBase record to Task type
const pbRecordToTask = (record: any): Task => {
  return {
    id: record.id,
    title: record.title || "",
    task_type: record.task_type as TaskType,
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

const DEFAULT_TASK_LIST_FIELDS = 'id,title,task_type,status,priority,startDate,dueDate,assignedTo,userId,created,updated,progress,isMilestone,dependencies,instrument_subtype,method,recurrence,expand';
const DEFAULT_TASK_DETAIL_FIELDS = 'id,title,task_type,description,status,priority,startDate,dueDate,assignedTo,userId,created,updated,progress,isMilestone,dependencies,attachments,instrument_subtype,method,recurrence,expand';


export const getTasks = async (pb: PocketBase, options?: PocketBaseRequestOptions & { projectionHorizon?: Date }): Promise<Task[]> => {
  try {
    const { onRetry, signal, projectionHorizon, ...otherOptions } = options || {};
    const requestParams = {
      sort: '-created',
      fields: DEFAULT_TASK_LIST_FIELDS,
      expand: 'assignedTo',
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
    const rawTasks = records.map(pbRecordToTask);

    if (projectionHorizon) {
      return generateProjectedTasks(rawTasks, projectionHorizon);
    }

    return rawTasks;
  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    console.error("Failed to fetch tasks:", error);
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<Task | null> => {
  try {
    const { onRetry, signal, ...otherOptions } = options || {};
    const requestParams = {
      fields: DEFAULT_TASK_DETAIL_FIELDS,
      expand: 'assignedTo',
      ...otherOptions,
    };
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id, requestParams, { signal }),
    {
      signal,
      context: `fetching task by ID ${id}`,
      onRetry
    });
    return pbRecordToTask(record);
  } catch (error: any) {
    if ((error as any).status === 404) {
        return null;
    }
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    console.error(`Failed to fetch task by ID ${id}:`, error);
    throw error;
  }
};

export const createTask = async (pb: PocketBase, taskData: FormData, options?: PocketBaseRequestOptions): Promise<Task> => {
  try {
    if (taskData.has('isMilestone')) {
      taskData.set('isMilestone', taskData.get('isMilestone') === 'true' ? 'true' : 'false');
    }

    const record = await pb.collection(COLLECTION_NAME).create(taskData, { signal: options?.signal, expand: 'assignedTo' });
    return pbRecordToTask(record);
  } catch (error) {
    handleCreateError(error, COLLECTION_NAME);
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
      pb.collection(COLLECTION_NAME).update(id, taskData, { signal, expand: 'assignedTo' }),
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

// Ensure getEmployees is exported if it's intended to be used elsewhere,
// or remove if it's a remnant from a previous thought process and not used by this service.
// For now, assuming it might be used by other parts not directly related to taskService's core functions.
export { getEmployees } from './employeeService'; // Example, adjust if getEmployees is elsewhere
