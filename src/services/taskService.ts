
'use client';
import type { PocketBaseInstance } from "@/context/AuthContext"; // Assuming this type exists or can be PocketBase
import type { Task } from "@/lib/types";
import type PocketBase from 'pocketbase';

const COLLECTION_NAME = "tasks";

// Helper to convert PocketBase record to Task type
const pbRecordToTask = (record: any): Task => {
  return {
    ...record,
    dueDate: record.dueDate ? new Date(record.dueDate) : undefined,
    createdAt: new Date(record.created),
    updatedAt: new Date(record.updated),
    // attachments are handled as URLs from PB, or File objects on client
    // If attachments are file tokens from PB, this needs more complex handling
  } as Task;
};


export const getTasks = async (pb: PocketBase): Promise<Task[]> => {
  try {
    const records = await pb.collection(COLLECTION_NAME).getFullList({
      sort: '-created',
      // expand: 'user,assignedTo' // if you have relations you want to expand
    });
    return records.map(pbRecordToTask);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    throw error;
  }
};

export const getTaskById = async (pb: PocketBase, id: string): Promise<Task | null> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).getOne(id);
    return pbRecordToTask(record);
  } catch (error) {
    console.error(`Failed to fetch task ${id}:`, error);
    // PocketBase throws an error if not found, which might be okay
    // or you might want to return null specifically for 404s
    if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};

export const createTask = async (pb: PocketBase, taskData: FormData): Promise<Task> => {
  try {
    // PocketBase SDK handles FormData directly for creating records with files
    const record = await pb.collection(COLLECTION_NAME).create(taskData);
    return pbRecordToTask(record);
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
};

export const updateTask = async (pb: PocketBase, id: string, taskData: FormData | Partial<Task>): Promise<Task> => {
  try {
    // If taskData includes files, it must be FormData
    // If not, it can be a partial Task object
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
