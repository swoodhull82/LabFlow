
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getCalendarEvents } from "@/services/calendarEventService";
import type { CalendarEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import WeeklyView from "@/components/calendar/WeeklyView";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type PocketBase from "pocketbase";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Could not connect to the server. Please check your internet connection.";
    } else if (error.data?.message) {
      message = error.data.message;
    } else if (error.message) {
      message = error.message;
    }
  }
  return message;
};

// Priority-based colors, consistent with other parts of the app
const getPriorityColor = (priority?: string) => {
  if (!priority) return '#6b7280'; // gray-500
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return '#ef4444'; // red-500
    case "high": return '#f97316';   // orange-500
    case "medium": return '#3b82f6'; // blue-500
    case "low": return '#10b981';    // green-500
    default: return '#6b7280';
  }
};


export default function TeamSchedulePage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (pb: PocketBase, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all tasks and treat them as calendar events
      const fetchedEvents = await getCalendarEvents(pb, { signal });
      setEvents(fetchedEvents);

    } catch (err: any) {
      const isCancellation = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (!isCancellation) {
        console.error("Failed to fetch team schedule data:", err);
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Data", description: detailedError, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient && user) {
      fetchData(pbClient, controller.signal);
    }
    return () => controller.abort();
  }, [pbClient, user, fetchData]);
  
  const priorityColorMap = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((event) => {
        // Use a unique key for each event, as multiple events can have the same priority
        map.set(event.id, getPriorityColor(event.priority));
    });
    return map;
  }, [events]);

  const refetchData = () => {
    if (pbClient && user) {
      fetchData(pbClient);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Team Schedule</h1>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Weekly Task Overview</CardTitle>
          <CardDescription>
            A weekly calendar view of all scheduled lab tasks. Task colors are based on priority.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-10 text-destructive h-96">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Data</p>
              <p className="text-sm whitespace-pre-wrap">{error}</p>
              <Button onClick={refetchData} className="mt-6">Try Again</Button>
            </div>
          ) : (
            <WeeklyView
              events={events}
              employeeColorMap={priorityColorMap} // Re-using this prop to pass color data
              isTeamView={true} // Ensures event owner names are shown if available
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
