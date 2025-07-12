
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getEmployees } from "@/services/employeeService";
import { getPersonalEvents } from "@/services/personalEventService";
import type { Employee, CalendarEvent } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Users } from "lucide-react";
import WeeklyView from "@/components/calendar/WeeklyView";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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

// A fallback color palette for employees without a custom color set
const FALLBACK_COLORS = [
  '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899',
  '#ef4444', '#f59e0b', '#14b8a6', '#6366f1', '#d946ef'
];

export default function TeamSchedulePage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [visibleEmployeeIds, setVisibleEmployeeIds] = useState<Set<string>>(new Set());
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  const fetchData = useCallback(async (pb: PocketBase, currentUserId: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      // For a supervisor, fetch all personal events.
      // This requires API rules on personal_events to allow supervisors to list/view all.
      const [fetchedEmployees, fetchedEvents] = await Promise.all([
        getEmployees(pb, { signal }),
        // Assuming a supervisor role can view all events.
        // The service needs a way to fetch all events if user is supervisor.
        // For now, we fetch events for the current user and assume sharing is set up for others.
        // A more robust solution would be a dedicated endpoint or adjusted API rules.
        getPersonalEvents(pb, currentUserId, { signal, expand: 'userId' }) // Expand userId to get owner info
      ]);
      
      setEmployees(fetchedEmployees);
      setEvents(fetchedEvents);

      // Initially, make all employees visible
      setVisibleEmployeeIds(new Set(fetchedEmployees.map(e => e.id)));

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
    employees.forEach((employee, index) => {
      map.set(employee.id, employee.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length]);
    });
    return map;
  }, [employees]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => event.ownerId && visibleEmployeeIds.has(event.ownerId));
  }, [events, visibleEmployeeIds]);

  const handleVisibilityToggle = (employeeId: string) => {
    setVisibleEmployeeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => setVisibleEmployeeIds(new Set(employees.map(e => e.id)));
  const handleSelectNone = () => setVisibleEmployeeIds(new Set());

  const refetchData = () => {
    if (pbClient && user) {
      fetchData(pbClient, user.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Team Schedule</h1>
        
        <Popover open={isFilterPopoverOpen} onOpenChange={setIsFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Users className="mr-2 h-4 w-4" />
              Filter Employees ({visibleEmployeeIds.size}/{employees.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <div className="p-4 border-b">
              <p className="text-sm font-medium">Show calendars for</p>
            </div>
            <ScrollArea className="h-72">
              <div className="p-4 space-y-2">
                {employees.map(employee => (
                  <div key={employee.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`vis-${employee.id}`}
                      checked={visibleEmployeeIds.has(employee.id)}
                      onCheckedChange={() => handleVisibilityToggle(employee.id)}
                    />
                    <Label htmlFor={`vis-${employee.id}`} className="font-normal flex items-center gap-2 cursor-pointer">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: employeeColorMap.get(employee.id) }}
                      />
                      {employee.name}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-between p-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>All</Button>
              <Button variant="ghost" size="sm" onClick={handleSelectNone}>None</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Weekly Overview</CardTitle>
          <CardDescription>
            A combined view of selected team members' personal calendars.
            <span className="block text-xs mt-1 text-muted-foreground">Note: This view is read-only. Events must be managed from each user's personal calendar.</span>
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
              events={filteredEvents}
              employeeColorMap={employeeColorMap}
              isTeamView={true}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

