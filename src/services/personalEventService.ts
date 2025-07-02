
'use client';
import type { CalendarEvent, TaskPriority } from "@/lib/types";
import PocketBase, { ClientResponseError } from 'pocketbase';
import { withRetry } from '@/lib/retry';
import { isValid } from 'date-fns';

const COLLECTION_NAME = "personal_events";

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


// Helper to convert PocketBase record to a CalendarEvent-compatible object
const pbRecordToPersonalEvent = (record: any): CalendarEvent | null => {
  const startDate = record.startDate ? new Date(record.startDate) : null;
  const endDate = record.endDate ? new Date(record.endDate) : null;

  if (!startDate || !endDate || !isValid(startDate) || !isValid(endDate)) {
    console.warn(`[personalEventService] Skipping event with ID ${record.id} due to missing or invalid dates.`);
    return null;
  }
  
  return {
    id: record.id,
    title: record.title,
    startDate: startDate,
    endDate: endDate,
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
      filter: `userId = "${userId}"`,
      sort: 'startDate',
      ...otherOptions,
    };

    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching personal events" }
    );
    
    // Map and filter out any records that are invalid
    return records
      .map(pbRecordToPersonalEvent)
      .filter((event): event is CalendarEvent => event !== null);

  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) {
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
    return pbRecordToPersonalEvent(record) as CalendarEvent;
  } catch (error) {
    handleCreateError(error, COLLECTION_NAME);
    // The line below is for TypeScript's benefit, as handleCreateError always throws.
    throw error;
  }
};
