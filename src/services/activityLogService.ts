
'use client';
import type { ActivityLogEntry } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "activity_log";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

// Helper to convert PocketBase record to ActivityLogEntry type
const pbRecordToActivityLogEntry = (record: any): ActivityLogEntry => {
  return {
    ...record,
    created: new Date(record.created),
    updated: new Date(record.updated),
  } as ActivityLogEntry;
};

export const getActivityLogEntries = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<ActivityLogEntry[]> => {
  try {
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList({
        sort: '-created', 
        ...options,
      })
    );
    return records.map(pbRecordToActivityLogEntry);
  } catch (error) {
    throw error;
  }
};

export const createActivityLogEntry = async (
  pb: PocketBase,
  entryData: { user_name: string; action: string; details?: string; target_resource?: string }
): Promise<ActivityLogEntry> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(entryData);
    return pbRecordToActivityLogEntry(record);
  } catch (error) {
    console.error("Failed to create activity log entry:", error);
    throw error;
  }
};
