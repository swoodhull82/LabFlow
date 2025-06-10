
'use client';
import type { CalendarEvent } from "@/lib/types";
import type PocketBase from 'pocketbase';

const COLLECTION_NAME = "calendar_events";

// Helper to convert PocketBase record to CalendarEvent type
const pbRecordToCalendarEvent = (record: any): CalendarEvent => {
  return {
    ...record,
    eventDate: new Date(record.eventDate), // Ensure eventDate is a Date object
    created: new Date(record.created),
    updated: new Date(record.updated),
  } as CalendarEvent;
};

export const getCalendarEvents = async (pb: PocketBase): Promise<CalendarEvent[]> => {
  try {
    const records = await pb.collection(COLLECTION_NAME).getFullList({
      sort: '-eventDate', // Sort by event date, adjust as needed
    });
    return records.map(pbRecordToCalendarEvent);
  } catch (error) {
    console.error("Failed to fetch calendar events:", error);
    throw error;
  }
};

// Optional: Add create, update, delete functions for calendar events if needed later
// export const createCalendarEvent = async (pb: PocketBase, eventData: Partial<Omit<CalendarEvent, 'id' | 'created' | 'updated'>>): Promise<CalendarEvent> => { ... }
// export const updateCalendarEvent = async (pb: PocketBase, id: string, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => { ... }
// export const deleteCalendarEvent = async (pb: PocketBase, id: string): Promise<void> => { ... }
