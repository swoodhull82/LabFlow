
"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useMemo, useEffect, useCallback } from "react";
import { format, isPast, isSameDay, isFuture, differenceInCalendarDays, startOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isValid, addYears } from "date-fns";
import type { CalendarEvent } from "@/lib/types"; 
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getCalendarEvents } from "@/services/calendarEventService"; 
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Dot, ChevronLeft, ChevronRight } from "lucide-react";
import type PocketBase from "pocketbase";
import { type DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";


const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching tasks for the calendar.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load calendar tasks: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object') {
      if (error.data.message && typeof error.data.message === 'string') {
        message = error.data.message;
      }
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    }

    if ('status' in error && error.status !== 0) {
      const status = error.status;
      if (status === 404) message = `The 'tasks' collection was not found (404).`;
      else if (status === 403) message = `You do not have permission to view tasks for the calendar (403).`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

const ALMOST_DUE_DAYS = 3;

function CalendarDayContent({ date, tasksForDay }: { date: Date; tasksForDay: CalendarEvent[] }) {
  const dayNumber = format(date, "d");
  const maxDots = 4;
  const dotCount = Math.min(tasksForDay.length, maxDots);

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center">
      <span>{dayNumber}</span>
      {dotCount > 0 && (
        <div className="absolute bottom-1 flex items-center justify-center">
          {Array.from({ length: dotCount }).map((_, i) => (
            <Dot key={i} className="h-3 w-3 -mx-1 text-primary/70" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [month, setMonth] = useState(new Date());
  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: startOfDay(new Date()),
  });

  const fetchEvents = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true); 
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const projectionHorizon = addYears(new Date(), 2);
      const fetchedEvents = await getCalendarEvents(pb, { signal, projectionHorizon }); 
      setAllEvents(fetchedEvents);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (isAutocancel) {
        console.warn(`Calendar events (tasks) fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
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

  const { tasksByDay, statusModifiers } = useMemo(() => {
    const tasksByDayMap = new Map<string, CalendarEvent[]>();
    const statusModifiersMap = {
      completed: new Set<number>(),
      overdue: new Set<number>(),
      almostDue: new Set<number>(),
      active: new Set<number>(),
    };

    const today = startOfDay(new Date());

    for (const event of allEvents) {
      if (!event.eventDate || !isValid(new Date(event.eventDate))) continue;
      const eventDateObj = startOfDay(new Date(event.eventDate));
      const dateKey = format(eventDateObj, "yyyy-MM-dd");

      if (!tasksByDayMap.has(dateKey)) {
        tasksByDayMap.set(dateKey, []);
      }
      tasksByDayMap.get(dateKey)!.push(event);

      if (event.status === "Done") {
        statusModifiersMap.completed.add(eventDateObj.getTime());
      } else if (isPast(eventDateObj) && !isSameDay(eventDateObj, today)) {
        statusModifiersMap.overdue.add(eventDateObj.getTime());
      } else {
        const diffDays = differenceInCalendarDays(eventDateObj, today);
        if (diffDays >= 0 && diffDays < ALMOST_DUE_DAYS) {
          statusModifiersMap.almostDue.add(eventDateObj.getTime());
        } else if (isFuture(eventDateObj) || isSameDay(eventDateObj, today)) {
          statusModifiersMap.active.add(eventDateObj.getTime());
        }
      }
    }

    return {
      tasksByDay: tasksByDayMap,
      statusModifiers: {
        completed: Array.from(statusModifiersMap.completed).map(t => new Date(t)),
        overdue: Array.from(statusModifiersMap.overdue).map(t => new Date(t)),
        almostDue: Array.from(statusModifiersMap.almostDue).map(t => new Date(t)),
        active: Array.from(statusModifiersMap.active).map(t => new Date(t)),
      },
    };
  }, [allEvents]);

  const eventsForSelectedRange = useMemo(() => {
    if (!range?.from) return [];
    const from = startOfDay(range.from);
    const to = range.to ? startOfDay(range.to) : from;

    const events: CalendarEvent[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const dateKey = format(day, "yyyy-MM-dd");
      if (tasksByDay.has(dateKey)) {
        events.push(...tasksByDay.get(dateKey)!);
      }
    }
    return events.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [range, tasksByDay]);

  const refetchEvents = () => {
    if (pbClient) {
      fetchEvents(pbClient);
    }
  };

  const handlePrevMonth = () => {
    setMonth(prev => addDays(startOfMonth(prev), -1));
  };
  const handleNextMonth = () => {
    setMonth(prev => addDays(startOfMonth(prev), 32));
  };

  const selectedRangeText = useMemo(() => {
    if (!range?.from) return "No date selected";
    if (!range.to || isSameDay(range.from, range.to)) return format(range.from, "PPP");
    return `${format(range.from, "PPP")} - ${format(range.to, "PPP")}`;
  }, [range]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-headline font-semibold">Task Calendar</h1>

      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading tasks for calendar...</p>
        </div>
      ) : error ? (
        <div className="text-center py-10 text-destructive">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-semibold">Failed to Load Calendar Data</p>
          <p className="text-sm whitespace-pre-wrap">{error}</p>
          <Button onClick={refetchEvents} className="mt-6">Try Again</Button>
        </div>
      ) : (
        <>
          <Card className="shadow-md">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                <h2 className="text-lg font-semibold ml-2">{format(month, "MMMM yyyy")}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setRange({ from: new Date(), to: new Date() })}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setRange({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) })}>This Week</Button>
                <Button variant="outline" size="sm" onClick={() => setRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>This Month</Button>
              </div>
            </CardHeader>
            <CardContent>
              <ShadcnCalendar
                mode="range"
                month={month}
                onMonthChange={setMonth}
                selected={range}
                onSelect={setRange}
                disabled={isPast}
                numberOfMonths={2}
                className="p-0"
                classNames={{
                  day_range_start: "day-range-start",
                  day_range_end: "day-range-end",
                  day_selected: "bg-primary/90 text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground rounded-full",
                  day_range_middle: "aria-selected:bg-primary/20 aria-selected:text-primary-foreground rounded-none",
                }}
                modifiers={statusModifiers}
                modifiersClassNames={{ 
                  completed: "!bg-green-100 dark:!bg-green-900/50",
                  overdue: "!bg-red-100 dark:!bg-red-900/50",
                  almostDue: "!bg-yellow-100 dark:!bg-yellow-800/50",
                  active: "!bg-blue-100 dark:!bg-blue-900/50",
                }} 
                components={{
                  DayContent: (props) => <CalendarDayContent date={props.date} tasksForDay={tasksByDay.get(format(props.date, "yyyy-MM-dd")) || []} />
                }}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Tasks for: {selectedRangeText}</CardTitle>
              <CardDescription>
                {eventsForSelectedRange.length} task(s) found in the selected period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsForSelectedRange.length > 0 ? (
                <ul className="space-y-3">
                  {eventsForSelectedRange.map(event => (
                    <li key={event.id} className="p-3 rounded-md border bg-card hover:bg-muted transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{event.title}</h3>
                          {event.description && <p className="text-sm text-muted-foreground mt-1">{event.description}</p>}
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <p className="text-sm font-medium">{format(new Date(event.eventDate), "MMM dd")}</p>
                          <p className={cn("text-xs", event.status === "Done" ? "text-green-600" : "text-muted-foreground")}>{event.status}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground py-8 text-center">No tasks scheduled for the selected period.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
