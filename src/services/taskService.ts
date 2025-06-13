
'use client';
import type { Task } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  onRetry?: (attempt: number, maxAttempts: number, error: any) => void; // Add this
  [key: string]: any; 
}

// Helper to convert PocketBase record to Task type
const pbRecordToTask = (record: any): Task => {
  return {
    ...record,
    startDate: record.startDate ? new Date(record.startDate) : undefined,
    dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    created: new Date(record.created), 
    updated: new Date(record.updated),
    dependencies: Array.isArray(record.dependencies) ? record.dependencies : [], 
  } as Task;
};


export const getTasks = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<Task[]> => {
  try {
    const { onRetry, ...restOptions } = options || {}; // Destructure onRetry
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList({
        sort: '-created',
        ...restOptions, // Pass remaining options
      }),
      {
        ...restOptions, // Pass other options like signal, context
        context: "fetching tasks list",
        onRetry // Pass the callback
      }
    );
    return records.map(pbRecordToTask);
  } catch (error) {
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<Task | null> => {
  try {
    const { onRetry, ...restOptions } = options || {}; // Destructure onRetry
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id, restOptions),
    {
      ...restOptions,
      context: `fetching task by ID ${id}`,
      onRetry // Pass the callback
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
  // Note: createTask is not being wrapped withRetry in this subtask,
  // but options are added for consistency if future needs arise e.g. for signal.
  // For now, options (like signal) are not used in create.
  try {
    const record = await pb.collection(COLLECTION_NAME).create(taskData, { signal: options?.signal });
    return pbRecordToTask(record);
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
};

export const updateTask = async (pb: PocketBase, id: string, taskData: FormData | Partial<Task>, options?: PocketBaseRequestOptions): Promise<Task> => {
  try {
    // Note: The check for taskData.dependencies was here, but PocketBase SDK handles array-to-JSON conversion for JSON fields.
    // It's usually not necessary to manually stringify. This part of the code can remain as is if no issues.
    const { signal } = options || {};
    const record = await withRetry(() =>
      pb.collection(COLLECTION_NAME).update(id, taskData, { signal }),
      { context: `updating task ${id}`, signal }
    );
    return pbRecordToTask(record);
  } catch (error) {
    // The console.error is kept, as withRetry might throw an error after retries,
    // or if the error is not retryable (e.g. validation error from PB).
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

