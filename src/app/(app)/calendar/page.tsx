
"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useEffect, useCallback } from "react";
import { format, isPast, isSameDay, isFuture, differenceInCalendarDays, startOfDay } from "date-fns";
import type { CalendarEvent } from "@/lib/types"; 
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getCalendarEvents } from "@/services/calendarEventService"; 
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import type PocketBase from "pocketbase";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching tasks for the calendar.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load calendar tasks: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object') {
      if (error.data.message && typeof error.data.message === 'string') {
        message = error.data.message;
      }
      if (error.data.data && typeof error.data.data === 'object' && Object.keys(error.data.data).length > 0) {
        const fieldErrorString = Object.entries(error.data.data)
          .map(([key, val]: [string, any]) => `${key}: ${val && val.message ? val.message : 'Invalid value'}`)
          .join("; ");
        message = fieldErrorString ? `${message}. Details: ${fieldErrorString}` : message;
      }
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
      message = error.originalError.message; 
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }

    if ('status' in error && error.status !== 0) {
      const status = error.status;
      if (status === 404) {
        message = `The 'tasks' collection (used for calendar events) was not found (404). ${message}`;
      } else if (status === 403) {
        message = `You do not have permission to view tasks for the calendar (403). ${message}`;
      } else if (status === 400) {
        const isGenericErrorMessage = message.toLowerCase().includes("something went wrong") || message.startsWith("PocketBase_ClientResponseError") || (error.data && Object.keys(error.data.data || {}).length === 0);
        if (isGenericErrorMessage) {
           message = `Request error (400): ${message}. Please check the 'tasks' collection schema, especially ensure 'dueDate' exists and is a sortable Date type.`;
        } else {
           message = `Request error (400) when fetching tasks for calendar: ${message}.`;
        }
      }
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

const ALMOST_DUE_DAYS = 3;

export default function CalendarPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    setDate(new Date());
  }, []);

  const fetchEvents = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true); 
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetchedEvents = await getCalendarEvents(pb, { signal }); 
      setAllEvents(fetchedEvents);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`Calendar events (tasks) fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Calendar Data", description: detailedError, variant: "destructive" });
        console.warn("Calendar events (tasks) fetch (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Calendar Data", description: detailedError, variant: "destructive" });
        console.warn("Error fetching tasks for calendar (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchEvents(pbClient, controller.signal);
    } else {
      setIsLoading(true); 
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchEvents]);

  const eventsForSelectedDate = useMemo(() => { 
    if (!date) return [];
    return allEvents.filter(event => 
      event.eventDate && format(new Date(event.eventDate), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
  }, [date, allEvents]);

  const { overdueEventDates, completedEventDates, almostDueEventDates, activeEventDates } = useMemo(() => {
    const today = startOfDay(new Date());
  
    const overdue: Date[] = [];
    const completed: Date[] = [];
    const almostDue: Date[] = [];
    const active: Date[] = [];
  
    allEvents.forEach(event => {
      if (!event.eventDate || !event.status) return;
      const eventDateObj = startOfDay(new Date(event.eventDate));
  
      if (event.status === "Done") {
        completed.push(eventDateObj);
      } else if (isPast(eventDateObj) && !isSameDay(eventDateObj, today)) {
        overdue.push(eventDateObj);
      } else {
        const diffDays = differenceInCalendarDays(eventDateObj, today);
        if (diffDays >= 0 && diffDays < ALMOST_DUE_DAYS) {
          almostDue.push(eventDateObj);
        } else if (isFuture(eventDateObj) || isSameDay(eventDateObj, today)) { 
          active.push(eventDateObj);
        }
      }
    });
    
    return {
      overdueEventDates: [...new Set(overdue.map(d => d.getTime()))].map(t => new Date(t)),
      completedEventDates: [...new Set(completed.map(d => d.getTime()))].map(t => new Date(t)),
      almostDueEventDates: [...new Set(almostDue.map(d => d.getTime()))].map(t => new Date(t)),
      activeEventDates: [...new Set(active.map(d => d.getTime()))].map(t => new Date(t)),
    };
  }, [allEvents]);


  const refetchEvents = () => {
    if (pbClient) {
      fetchEvents(pbClient); // Consider AbortController if this can be rapid-clicked
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-headline font-semibold">Task Calendar</h1>
      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading tasks for calendar...</p>
        </div>
      )}
      {error && !isLoading && (
        <div className="text-center py-10 text-destructive">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-semibold">Failed to Load Calendar Data</p>
          <p className="text-sm whitespace-pre-wrap">{error}</p>
          <Button onClick={refetchEvents} className="mt-6">Try Again</Button>
        </div>
      )}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-md">
            <CardContent className="p-0">
              <ShadcnCalendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                modifiers={{ 
                  completed: completedEventDates,
                  overdue: overdueEventDates,
                  almostDue: almostDueEventDates,
                  active: activeEventDates,
                }} 
                modifiersClassNames={{ 
                  completed: "!bg-green-100 !text-green-800 dark:!bg-green-800/30 dark:!text-green-200 border !border-green-300 dark:!border-green-700 rounded-md",
                  overdue: "!bg-red-100 !text-red-800 dark:!bg-red-800/30 dark:!text-red-200 border !border-red-300 dark:!border-red-700 rounded-md",
                  almostDue: "!bg-yellow-100 !text-yellow-800 dark:!bg-yellow-700/30 dark:!text-yellow-200 border !border-yellow-300 dark:!border-yellow-600 rounded-md",
                  active: "!bg-blue-100 !text-blue-800 dark:!bg-blue-800/30 dark:!text-blue-200 border !border-blue-300 dark:!border-blue-700 rounded-md",
                }} 
              />
            </CardContent>
          </Card>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="font-headline">
                Tasks for {date ? format(date, "PPP") : "selected date"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventsForSelectedDate.length > 0 ? (
                <ul className="space-y-3">
                  {eventsForSelectedDate.map(event => (
                    <li key={event.id} className="p-3 rounded-md border hover:bg-muted transition-colors">
                      <h3 className="font-semibold">{event.title}</h3>
                      {event.description && <p className="text-sm text-muted-foreground mt-1">{event.description}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No tasks due on this day.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
