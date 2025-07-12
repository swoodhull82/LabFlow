
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getPersonalEvents } from "@/services/personalEventService";
import { getEmployees } from "@/services/employeeService";
import type { CalendarEvent, Employee } from "@/lib/types";
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

export default function TeamSchedulePage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (pb: PocketBase, currentUserId: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      // getPersonalEvents will fetch all events the current user is allowed to see,
      // including their own and those from users who have shared their calendar.
      const [fetchedEvents, fetchedEmployees] = await Promise.all([
        getPersonalEvents(pb, currentUserId, { signal }),
        getEmployees(pb, { signal }),
      ]);
      setEvents(fetchedEvents);
      setEmployees(fetchedEmployees);
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
      fetchData(pbClient, user.id, controller.signal);
    }
    return () => controller.abort();
  }, [pbClient, user, fetchData]);
  
  const employeeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(employee => {
      // Find the user account associated with the employee to get the correct user ID for event mapping
      const userForEmployee = user?.id; // This is a simplification. A real app would map employee.userId to a user record.
                                         // For now, we assume all events are owned by a user that might be an employee.
                                         
      if (employee.color && employee.userId) { // Ensure employee has a color and is linked to a user
        map.set(employee.userId, employee.color);
      }
    });
    return map;
  }, [employees, user]);

  const eventsWithColor = useMemo(() => {
    return events.map(event => {
      if (event.ownerId && employeeColorMap.has(event.ownerId)) {
        return { ...event, color: employeeColorMap.get(event.ownerId) };
      }
      return event;
    });
  }, [events, employeeColorMap]);

  const refetchData = () => {
    if (pbClient && user) {
      fetchData(pbClient, user.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Team Schedule</h1>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Weekly Team Availability</CardTitle>
          <CardDescription>
            A combined view of all shared employee schedules. Events are color-coded by employee.
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
              events={eventsWithColor}
              isTeamView={true}
              // Clicking on the team schedule won't open a form to prevent
              // users from accidentally creating events on someone else's calendar.
              // Event creation should happen on the "My Calendar" page.
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
