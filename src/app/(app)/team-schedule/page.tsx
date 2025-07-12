
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getPersonalEvents, deletePersonalEvent } from "@/services/personalEventService";
import { getEmployees } from "@/services/employeeService";
import type { CalendarEvent, Employee } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, PlusCircle } from "lucide-react";
import WeeklyView from "@/components/calendar/WeeklyView";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type PocketBase from "pocketbase";
import { TeamEventForm } from "@/components/tasks/TeamEventForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";


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
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const isSupervisor = user?.role === 'Supervisor';

  const fetchData = useCallback(async (pb: PocketBase, currentUserId: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
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
      if (employee.color && employee.userId) {
        map.set(employee.userId, employee.color);
      }
    });
    return map;
  }, [employees]);

  const eventsWithColor = useMemo(() => {
    return events.map(event => {
      if (event.ownerId && employeeColorMap.has(event.ownerId)) {
        return { ...event, color: employeeColorMap.get(event.ownerId) };
      }
      return event;
    });
  }, [events, employeeColorMap]);

  const handleDataChanged = () => {
    if (pbClient && user) {
      fetchData(pbClient, user.id);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
    setSelectedDate(undefined);
  };
  
  const handleEventClick = (event: CalendarEvent) => {
    if (isSupervisor) {
      setEditingEvent(event);
      setIsFormOpen(true);
    }
  };

  const handleHourSlotClick = (date: Date) => {
    if (isSupervisor) {
      setSelectedDate(date);
      setEditingEvent(null);
      setIsFormOpen(true);
    }
  };
  
  const handleDeleteEvent = async (eventId: string) => {
    if (!pbClient) return;
    try {
      await deletePersonalEvent(pbClient, eventId);
      toast({ title: "Event Deleted", description: "The event has been removed." });
      handleDataChanged();
      handleFormClose();
    } catch (error: any) {
      toast({ title: "Error Deleting Event", description: getDetailedErrorMessage(error), variant: "destructive" });
    }
  };


  const refetchData = () => {
    if (pbClient && user) {
      fetchData(pbClient, user.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Team Schedule</h1>
        {isSupervisor && (
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingEvent(null); setSelectedDate(new Date()); setIsFormOpen(true); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> New Team Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingEvent ? 'Edit Event' : 'New Team Event'}</DialogTitle>
              </DialogHeader>
              <TeamEventForm
                employees={employees}
                onEventUpserted={handleDataChanged}
                onDialogClose={handleFormClose}
                onDelete={handleDeleteEvent}
                eventToEdit={editingEvent}
                defaultDate={selectedDate}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Weekly Team Availability</CardTitle>
          <CardDescription>
            A combined view of all shared employee schedules. {isSupervisor ? "Click on an event to edit or on an empty slot to create a new event for an employee." : "Events are color-coded by employee."}
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
              onEventClick={isSupervisor ? handleEventClick : undefined}
              onHourSlotClick={isSupervisor ? handleHourSlotClick : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
