
'use client';
import type { CalendarEvent, PersonalEventType } from "@/lib/types";
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
const pbRecordToPersonalEvent = (record: any, currentUserId: string): CalendarEvent | null => {
  const startDate = record.startDate ? new Date(record.startDate) : null;
  const endDate = record.endDate ? new Date(record.endDate) : null;

  if (!startDate || !endDate || !isValid(startDate) || !isValid(endDate)) {
    console.warn(`[personalEventService] Skipping event with ID ${record.id} due to missing or invalid dates.`);
    return null;
  }
  
  const owner = record.expand?.userId;
  const isOwner = !owner || owner.id === currentUserId;

  return {
    id: record.id,
    title: record.title,
    startDate: startDate,
    endDate: endDate,
    description: record.description,
    userId: record.userId,
    isAllDay: record.isAllDay || false,
    eventType: record.eventType || 'Available',
    created: new Date(record.created),
    updated: new Date(record.updated),
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    ownerId: owner?.id,
    ownerName: isOwner ? undefined : owner?.name,
  } as CalendarEvent;
};

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

export const getPersonalEvents = async (pb: PocketBase, userId: string, options?: PocketBaseRequestOptions): Promise<CalendarEvent[]> => {
  if (!userId) {
    console.warn("[personalEventService] getPersonalEvents called without a userId. Returning empty array to protect privacy.");
    return [];
  }
  try {
    // With correct API rules, we no longer need to manually build the filter.
    // PocketBase will automatically filter the results based on the logged-in user's auth context.
    const { signal, ...otherOptions } = options || {};
    const requestParams = {
      sort: 'startDate',
      expand: 'userId', // expand the user relation to get owner info
      ...otherOptions,
    };

    const records = await withRetry(() =>
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching personal events" }
    );

    // Map and filter out any records that are invalid
    return records
      .map(record => pbRecordToPersonalEvent(record, userId))
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
    userId: string;
    isAllDay?: boolean;
    eventType?: PersonalEventType;
}

export const createPersonalEvent = async (
  pb: PocketBase,
  eventData: PersonalEventCreationData
): Promise<CalendarEvent> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(eventData);
    // For a newly created event, the owner is always the creator.
    const personalEvent = pbRecordToPersonalEvent(record, eventData.userId);
    if (!personalEvent) {
        throw new Error("Failed to process the created event record.");
    }
    return personalEvent;
  } catch (error) {
    handleCreateError(error, COLLECTION_NAME);
    // The line below is for TypeScript's benefit, as handleCreateError always throws.
    throw error;
  }
};

export interface PersonalEventUpdateData {
    title?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    isAllDay?: boolean;
    eventType?: PersonalEventType;
}

export const updatePersonalEvent = async (
  pb: PocketBase,
  eventId: string,
  eventData: PersonalEventUpdateData
): Promise<CalendarEvent> => {
  try {
    const record = await withRetry(() =>
        pb.collection(COLLECTION_NAME).update(eventId, eventData),
        { context: `updating personal event ${eventId}` }
    );
    // We don't know the current user ID here, but for an update, it must be the owner.
    const personalEvent = pbRecordToPersonalEvent(record, record.userId);
    if (!personalEvent) {
        throw new Error("Failed to process the updated event record.");
    }
    return personalEvent;
  } catch (error) {
    console.error(`Failed to update personal event ${eventId}:`, error);
    handleCreateError(error, COLLECTION_NAME); // Re-use create error handler as it covers validation
    throw error;
  }
};

export const deletePersonalEvent = async (
  pb: PocketBase,
  eventId: string,
): Promise<void> => {
  try {
     await withRetry(() =>
        pb.collection(COLLECTION_NAME).delete(eventId),
        { context: `deleting personal event ${eventId}` }
    );
  } catch (error) {
    console.error(`Failed to delete personal event ${eventId}:`, error);
    if (error instanceof ClientResponseError && error.status === 404) {
      console.warn(`Attempted to delete non-existent personal event ${eventId}`);
      return;
    }
    throw error;
  }
};
