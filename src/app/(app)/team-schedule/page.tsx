
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { getPersonalEvents, deletePersonalEvent } from "@/services/personalEventService";
import { getEmployees } from "@/services/employeeService";
import type { CalendarEvent, Employee } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import WeeklyView from "@/components/calendar/WeeklyView";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type PocketBase from "pocketbase";
import { TeamEventForm } from "@/components/tasks/TeamEventForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { startOfWeek, add, format } from 'date-fns';

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
  const [currentDate, setCurrentDate] = useState(new Date());

  const currentWeekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);

  const isSupervisor = user?.role === 'Supervisor';

  const fetchData = useCallback(async (pb: PocketBase, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedEvents, fetchedEmployees] = await Promise.all([
        // Fetch all personal events if supervisor, otherwise just user's own
        getPersonalEvents(pb, isSupervisor ? undefined : user?.id, { signal, expand: 'userId,employeeId' }),
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
  }, [toast, user?.id, isSupervisor]);

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
      // Use employeeId for mapping, as it's the direct link
      if (employee.color && employee.id) {
        map.set(employee.id, employee.color);
      }
    });
    return map;
  }, [employees]);

  const eventsWithColor = useMemo(() => {
    return events.map(event => {
      // Prioritize employeeId for color lookup
      if (event.employeeId && employeeColorMap.has(event.employeeId)) {
        return { ...event, color: employeeColorMap.get(event.employeeId) };
      }
      // Fallback for user's own events if they are also an employee with a color set
      if (event.userId && employeeColorMap.has(event.userId)) {
          return { ...event, color: employeeColorMap.get(event.userId)};
      }
      return event;
    });
  }, [events, employeeColorMap]);

  const handleDataChanged = () => {
    if (pbClient && user) {
      fetchData(pbClient);
    }
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
  };
  
  const handleEventClick = (event: CalendarEvent) => {
    if (isSupervisor) {
      setEditingEvent(event);
      setIsFormOpen(true);
    }
  };

  const handleHourSlotClick = (date: Date) => {
    if (isSupervisor) {
      setEditingEvent(null); // Ensure we are creating a new event
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
      fetchData(pbClient);
    }
  };

  const handlePrevWeek = () => setCurrentDate(current => add(current, { weeks: -1 }));
  const handleNextWeek = () => setCurrentDate(current => add(current, { weeks: 1 }));
  const handleToday = () => setCurrentDate(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Team Schedule</h1>
        {isSupervisor && (
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingEvent(null); setIsFormOpen(true); }}>
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
                weekToShow={currentWeekStart}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="shadow-md">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b p-3 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">{format(currentWeekStart, 'MMMM yyyy')}</span>
            <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrevWeek}><ChevronLeft className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={handleNextWeek}><ChevronRight className="h-5 w-5" /></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
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
              weekStartDate={currentWeekStart}
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
