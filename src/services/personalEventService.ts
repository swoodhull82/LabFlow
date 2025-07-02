
'use client';
import type { CalendarEvent, TaskPriority } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "personal_events";

// Helper to convert PocketBase record to a CalendarEvent-compatible object
const pbRecordToPersonalEvent = (record: any): CalendarEvent => {
  return {
    id: record.id,
    title: record.title,
    startDate: record.startDate ? new Date(record.startDate) : new Date(),
    endDate: record.endDate ? new Date(record.endDate) : new Date(),
    description: record.description,
    priority: record.priority,
    userId: record.userId,
    created: new Date(record.created),
    updated: new Date(record.updated),
    collectionId: record.collectionId,
    collectionName: record.collectionName,
  } as CalendarEvent;
};

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

export const getPersonalEvents = async (pb: PocketBase, userId: string, options?: PocketBaseRequestOptions): Promise<CalendarEvent[]> => {
  try {
    const { signal, ...otherOptions } = options || {};
    const requestParams = {
      filter: `userId = "${pb.client.realtime.encode(userId)}"`,
      sort: 'startDate',
      ...otherOptions,
    };

    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching personal events" }
    );
    
    return records.map(pbRecordToPersonalEvent);
  } catch (error) {
    // Check if the error is because the collection doesn't exist (e.g., 404)
    if ((error as any)?.status === 404) {
      console.warn(`[personalEventService] The '${COLLECTION_NAME}' collection was not found. Returning empty array. Please create it in PocketBase.`);
      return [];
    }
    throw error;
  }
};

interface PersonalEventCreationData {
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    priority: TaskPriority;
    userId: string;
}

export const createPersonalEvent = async (
  pb: PocketBase,
  eventData: PersonalEventCreationData
): Promise<CalendarEvent> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(eventData);
    return pbRecordToPersonalEvent(record);
  } catch (error) {
    console.error("Failed to create personal event:", error);
    throw error;
  }
};
