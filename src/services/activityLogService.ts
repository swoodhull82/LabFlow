
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
    const { signal, ...otherOptions } = options || {};
    const defaultFields = 'id,created,user_name,action,details';
    const requestParams = {
      sort: '-created',
      fields: defaultFields,
      ...otherOptions, // Allow overriding sort and fields if provided in options
    };

    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching activity log entries" }
    );
    return records.map(pbRecordToActivityLogEntry);
  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    console.error("Failed to fetch activity log entries:", error);
    throw error;
  }
};

export const createActivityLogEntry = async (
  pb: PocketBase,
  entryData: { user_name: string; action: string; details?: string; target_resource?: string }
): Promise<ActivityLogEntry> => {
  try {
    // Create operations are typically not retried automatically by default to avoid duplicate creations
    const record = await pb.collection(COLLECTION_NAME).create(entryData);
    return pbRecordToActivityLogEntry(record);
  } catch (error) {
    console.error("Failed to create activity log entry:", error);
    throw error;
  }
};
