
'use client';
import type { Task } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "tasks";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
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
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList({
        sort: '-created',
        ...options, 
      }),
      { ...options, context: "fetching tasks list" }
    );
    return records.map(pbRecordToTask);
  } catch (error) {
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<Task | null> => {
  try {
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id, options), { ...options, context: `fetching task by ID ${id}` });
    return pbRecordToTask(record);
  } catch (error) {
    if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};

export const createTask = async (pb: PocketBase, taskData: FormData): Promise<Task> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(taskData);
    return pbRecordToTask(record);
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
};

export const updateTask = async (pb: PocketBase, id: string, taskData: FormData | Partial<Task>): Promise<Task> => {
  try {
     // If taskData is an object and has dependencies, ensure it's stringified for PocketBase JSON field
    if (!(taskData instanceof FormData) && taskData.dependencies && Array.isArray(taskData.dependencies)) {
      // PocketBase SDK typically handles JS arrays for JSON fields correctly,
      // but if direct API calls were made or issues persist, stringifying might be needed.
      // For the SDK, direct array assignment should be fine.
      // taskData.dependencies = JSON.stringify(taskData.dependencies) as any; // No longer needed, PB handles arrays for JSON fields
    }
    const record = await pb.collection(COLLECTION_NAME).update(id, taskData);
    return pbRecordToTask(record);
  } catch (error) {
    console.error(`Failed to update task ${id}:`, error);
    throw error;
  }
};

export const deleteTask = async (pb: PocketBase, id: string): Promise<void> => {
  try {
    await pb.collection(COLLECTION_NAME).delete(id);
  } catch (error) {
    console.error(`Failed to delete task ${id}:`, error);
    throw error;
  }
};

