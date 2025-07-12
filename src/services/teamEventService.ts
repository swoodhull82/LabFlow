
'use client';
import type { CalendarEvent, Employee } from "@/lib/types";
import PocketBase, { ClientResponseError } from 'pocketbase';
import { withRetry } from '@/lib/retry';
import { isValid, addYears, addMonths, addWeeks, addDays, isBefore } from 'date-fns';

const COLLECTION_NAME = "team_events";

// Helper to handle common creation errors from PocketBase
const handleCreateError = (error: any, collectionName: string) => {
    if (error instanceof ClientResponseError) {
        if (error.status === 404) {
            throw new Error(`Cannot create item: The '${collectionName}' collection does not exist. Please create it in your PocketBase admin panel.`);
        }
        if (error.status === 400 && error.data?.data) {
            const fieldErrors = Object.entries(error.data.data)
                .map(([key, val]: [string, any]) => `${key}: ${val.message}`)
                .join('; ');
            throw new Error(`Validation failed. Server says: ${fieldErrors}`);
        }
    }
    console.error(`Failed to create item in ${collectionName}:`, error);
    throw error;
};

// Helper to convert PocketBase record to a CalendarEvent-compatible object
const pbRecordToTeamEvent = (record: any): CalendarEvent | null => {
  const startDate = record.startDate ? new Date(record.startDate) : null;
  const endDate = record.endDate ? new Date(record.endDate) : null;

  if (!startDate || !endDate || !isValid(startDate) || !isValid(endDate)) {
    console.warn(`[teamEventService] Skipping event with ID ${record.id} due to missing or invalid dates.`);
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    startDate,
    endDate,
    description: record.description,
    isAllDay: record.isAllDay || false,
    color: record.color,
    assignedTo: record.assignedTo || [],
    createdBy: record.createdBy,
    created: new Date(record.created),
    updated: new Date(record.updated),
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    expand: record.expand,
  };
};

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  [key: string]: any;
}

export const getTeamEvents = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<CalendarEvent[]> => {
  try {
    const { signal, ...otherOptions } = options || {};
    const requestParams = {
      sort: 'startDate',
      expand: 'assignedTo,createdBy',
      ...otherOptions,
    };

    const records = await withRetry(() =>
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching team events" }
    );

    return records
      .map(record => pbRecordToTeamEvent(record))
      .filter((event): event is CalendarEvent => event !== null);

  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    if (error instanceof ClientResponseError && error.status === 404) {
      console.warn(`[teamEventService] The '${COLLECTION_NAME}' collection was not found. Returning empty array. Please create it in PocketBase.`);
      return [];
    }
    console.error("Failed to fetch team events:", error);
    throw error;
  }
};

export const createTeamEvent = async (pb: PocketBase, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(eventData, { expand: 'assignedTo,createdBy' });
    const teamEvent = pbRecordToTeamEvent(record);
    if (!teamEvent) {
        throw new Error("Failed to process the created team event record.");
    }
    return teamEvent;
  } catch (error) {
    handleCreateError(error, COLLECTION_NAME);
    throw error;
  }
};

export const updateTeamEvent = async (pb: PocketBase, eventId: string, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => {
  try {
    const record = await withRetry(() =>
        pb.collection(COLLECTION_NAME).update(eventId, eventData, { expand: 'assignedTo,createdBy' }),
        { context: `updating team event ${eventId}` }
    );
    const teamEvent = pbRecordToTeamEvent(record);
    if (!teamEvent) {
        throw new Error("Failed to process the updated team event record.");
    }
    return teamEvent;
  } catch (error) {
    console.error(`Failed to update team event ${eventId}:`, error);
    handleCreateError(error, COLLECTION_NAME);
    throw error;
  }
};

export const deleteTeamEvent = async (pb: PocketBase, eventId: string): Promise<void> => {
  try {
     await withRetry(() =>
        pb.collection(COLLECTION_NAME).delete(eventId),
        { context: `deleting team event ${eventId}` }
    );
  } catch (error) {
    console.error(`Failed to delete team event ${eventId}:`, error);
    if (error instanceof ClientResponseError && error.status === 404) {
      console.warn(`Attempted to delete non-existent team event ${eventId}`);
      return;
    }
    throw error;
  }
};
