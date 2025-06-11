
'use client';
import type { ActivityLogEntry } from "@/lib/types";
import type PocketBase from 'pocketbase';

const COLLECTION_NAME = "activity_log";

// Helper to convert PocketBase record to ActivityLogEntry type
const pbRecordToActivityLogEntry = (record: any): ActivityLogEntry => {
  return {
    ...record,
    created: new Date(record.created),
    updated: new Date(record.updated),
  } as ActivityLogEntry;
};

export const getActivityLogEntries = async (pb: PocketBase): Promise<ActivityLogEntry[]> => {
  try {
    const records = await pb.collection(COLLECTION_NAME).getFullList({
      sort: '-created', // Fetch most recent entries first
    });
    return records.map(pbRecordToActivityLogEntry);
  } catch (error) {
    console.error("Failed to fetch activity log entries:", error);
    throw error;
  }
};

// Optional: Function to create a log entry, can be called from other services
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
