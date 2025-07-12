
'use client';
import type { CalendarEvent, PersonalEventType, TaskRecurrence, TaskPriority } from "@/lib/types";
import PocketBase, { ClientResponseError } from 'pocketbase';
import { withRetry } from '@/lib/retry';
import { isValid, addYears, addMonths, addWeeks, addDays, isBefore } from 'date-fns';

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
  
  const owner = record.expand?.userId;
  const employee = record.expand?.employeeId;

  return {
    id: record.id,
    title: record.title,
    startDate: startDate,
    endDate: endDate,
    description: record.description,
    priority: record.priority,
    userId: record.userId,
    employeeId: record.employeeId,
    isAllDay: record.isAllDay || false,
    eventType: record.eventType || 'Available',
    recurrence: record.recurrence || 'None',
    created: new Date(record.created),
    updated: new Date(record.updated),
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    ownerId: owner?.id,
    ownerName: employee?.name || owner?.name,
    expand: record.expand,
  } as CalendarEvent;
};

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  projectionHorizon?: Date;
  [key: string]: any;
}

export const getPersonalEvents = async (pb: PocketBase, userId?: string, options?: PocketBaseRequestOptions): Promise<CalendarEvent[]> => {
  if (!userId && pb.authStore.model?.role !== 'Supervisor') {
    console.warn("[personalEventService] getPersonalEvents called without a userId for a non-supervisor. Returning empty array.");
    return [];
  }
  try {
    const { signal, projectionHorizon, ...otherOptions } = options || {};
    const requestParams: any = {
      sort: 'startDate',
      expand: 'userId,employeeId',
      ...otherOptions,
    };
    
    // If a specific userId is provided, filter for it. Otherwise, a supervisor gets all.
    // The API rules on the server provide the actual security.
    if(userId) {
        requestParams.filter = `(userId = "${userId}" || employeeId.userId = "${userId}")`;
    }

    const records = await withRetry(() =>
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      { ...options, context: "fetching personal events" }
    );

    const rawEvents = records
      .map(record => pbRecordToPersonalEvent(record))
      .filter((event): event is CalendarEvent => event !== null);
      
    if (projectionHorizon) {
      return generateProjectedPersonalEvents(rawEvents, projectionHorizon);
    }
    return rawEvents;

  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        throw error;
    }
    if (error instanceof ClientResponseError && error.status === 404) {
      console.warn(`[personalEventService] The '${COLLECTION_NAME}' collection was not found. Returning empty array. Please create it in PocketBase.`);
      return [];
    }
    console.error("Failed to fetch personal events:", error);
    throw error;
  }
};

interface PersonalEventCreationData {
    title: string;
    description?: string;
    priority?: TaskPriority;
    startDate: Date;
    endDate: Date;
    userId?: string; 
    employeeId?: string;
    isAllDay?: boolean;
    eventType?: PersonalEventType;
    recurrence?: TaskRecurrence;
}

export const createPersonalEvent = async (
  pb: PocketBase,
  eventData: PersonalEventCreationData,
  options?: { signal?: AbortSignal }
): Promise<CalendarEvent> => {
  try {
    const record = await withRetry(() =>
      pb.collection(COLLECTION_NAME).create(eventData),
      { context: "creating personal event", signal: options?.signal }
    );
    const personalEvent = pbRecordToPersonalEvent(record);
    if (!personalEvent) {
        throw new Error("Failed to process the created event record.");
    }
    return personalEvent;
  } catch (error) {
    handleCreateError(error, COLLECTION_NAME);
    throw error;
  }
};

export interface PersonalEventUpdateData {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    startDate?: Date;
    endDate?: Date;
    isAllDay?: boolean;
    eventType?: PersonalEventType;
    recurrence?: TaskRecurrence;
    employeeId?: string;
    userId?: string;
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
    const personalEvent = pbRecordToPersonalEvent(record);
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

function generateProjectedPersonalEvents(events: CalendarEvent[], horizonDate: Date): CalendarEvent[] {
  const allEvents: CalendarEvent[] = [];

  events.forEach(originalEvent => {
    allEvents.push(originalEvent);

    if (originalEvent.recurrence === 'None' || !originalEvent.endDate) {
      return;
    }

    let nextDueDate = new Date(originalEvent.endDate);
    const originalDuration = new Date(originalEvent.endDate).getTime() - new Date(originalEvent.startDate).getTime();
    
    let i = 1;

    while (true) {
      const lastDueDate = new Date(nextDueDate);
      switch (originalEvent.recurrence) {
        case 'Daily':
          nextDueDate = addDays(lastDueDate, 1);
          break;
        case 'Weekly':
          nextDueDate = addWeeks(lastDueDate, 1);
          break;
        case 'Monthly':
          nextDueDate = addMonths(lastDueDate, 1);
          break;
        case 'Yearly':
          nextDueDate = addYears(lastDueDate, 1);
          break;
        default:
          return;
      }

      if (isBefore(nextDueDate, horizonDate)) {
        const newStartDate = new Date(nextDueDate.getTime() - originalDuration);
        
        const projectedEvent: CalendarEvent = {
          ...originalEvent,
          id: `${originalEvent.id}_proj_${i}`,
          startDate: newStartDate,
          endDate: nextDueDate,
          description: `Recurring instance of: ${originalEvent.title}`,
        };
        allEvents.push(projectedEvent);
        i++;
      } else {
        break;
      }
    }
  });

  return allEvents;
}
