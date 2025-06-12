
'use client';
import type { Task } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "tasks";

// Helper to convert PocketBase record to Task type
const pbRecordToTask = (record: any): Task => {
  return {
    ...record,
    startDate: record.startDate ? new Date(record.startDate) : undefined,
    dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    created: new Date(record.created), // Ensure created is a Date object
    updated: new Date(record.updated), // Ensure updated is a Date object
    // attachments are handled as URLs from PB, or File objects on client
    // If attachments are file tokens from PB, this needs more complex handling
  } as Task;
};


export const getTasks = async (pb: PocketBase): Promise<Task[]> => {
  try {
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList({
        sort: '-created',
        // expand: 'user,assignedTo' // if you have relations you want to expand
      })
    );
    return records.map(pbRecordToTask);
  } catch (error) {
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string): Promise<Task | null> => {
  try {
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id));
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
    // Create operations might not always be suitable for retries without idempotency keys
    // Not wrapping with retry by default for CUD operations
    const record = await pb.collection(COLLECTION_NAME).create(taskData);
    return pbRecordToTask(record);
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
};

export const updateTask = async (pb: PocketBase, id: string, taskData: FormData | Partial<Task>): Promise<Task> => {
  try {
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

