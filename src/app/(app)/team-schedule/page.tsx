
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getTeamEvents, deleteTeamEvent } from "@/services/teamEventService";
import { getEmployees } from "@/services/employeeService";
import type { CalendarEvent, Employee } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import WeeklyView from "@/components/calendar/WeeklyView";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TeamEventForm } from "@/components/tasks/TeamEventForm";
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

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);

  const fetchData = useCallback(async (pb: PocketBase, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedEvents, fetchedEmployees] = await Promise.all([
        getTeamEvents(pb, { signal }),
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
      fetchData(pbClient, controller.signal);
    }
    return () => controller.abort();
  }, [pbClient, user, fetchData]);
  
  const employeeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(employee => {
      if (employee.color) {
        map.set(employee.id, employee.color);
      }
    });
    
    // For each event, determine its color based on assigned employees
    const eventColorMap = new Map<string, string>();
    events.forEach(event => {
        // If event has multiple assignees, we could blend colors or pick first one.
        // For simplicity, let's pick the color of the first assigned employee.
        const firstAssigneeId = event.assignedTo?.[0];
        if(firstAssigneeId && map.has(firstAssigneeId)){
            eventColorMap.set(event.id, map.get(firstAssigneeId)!);
        } else if (event.color) { // Fallback to event's own color if it has one
            eventColorMap.set(event.id, event.color);
        }
    });

    return eventColorMap;
  }, [events, employees]);

  const handleDataChanged = () => {
    if (pbClient) fetchData(pbClient);
  };

  const openFormForNew = (date: Date) => {
    setSelectedEvent(null);
    setDefaultDate(date);
    setIsFormOpen(true);
  };

  const openFormForEdit = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDefaultDate(undefined);
    setIsFormOpen(true);
  };
  
  const closeForm = () => {
    setIsFormOpen(false);
    setSelectedEvent(null);
    setDefaultDate(undefined);
  };
  
  const handleDeleteEvent = async (eventId: string) => {
    if (!pbClient) return;
    try {
      await deleteTeamEvent(pbClient, eventId);
      toast({ title: "Event Deleted", description: "The team event has been removed." });
      handleDataChanged();
      closeForm();
    } catch (error: any) {
      toast({ title: "Error Deleting Event", description: getDetailedErrorMessage(error), variant: "destructive" });
    }
  };


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
          <CardTitle className="font-headline">Weekly Team Calendar</CardTitle>
          <CardDescription>
            A weekly calendar view of all team-related events like meetings or maintenance.
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
              employeeColorMap={employeeColorMap} 
              isTeamView={true}
              onHourSlotClick={openFormForNew}
              onEventClick={openFormForEdit}
            />
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedEvent ? 'Edit Team Event' : 'Add New Team Event'}</DialogTitle>
          </DialogHeader>
          <TeamEventForm
            employees={employees}
            eventToEdit={selectedEvent}
            defaultDate={defaultDate}
            onDialogClose={closeForm}
            onDataChanged={handleDataChanged}
            onDelete={handleDeleteEvent}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
