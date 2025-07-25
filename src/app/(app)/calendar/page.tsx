
"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { format, isPast, isSameDay, isFuture, differenceInCalendarDays, startOfDay, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isValid, addYears, isBefore } from "date-fns";
import type { CalendarEvent, TaskPriority, TaskStatus } from "@/lib/types"; 
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getCalendarEvents } from "@/services/calendarEventService"; 
import { getPersonalEvents, deletePersonalEvent } from "@/services/personalEventService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Dot, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import type PocketBase from "pocketbase";
import { type DateRange, type DayModifiers } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import WeeklyView from '@/components/calendar/WeeklyView';
import type { ClientResponseError } from 'pocketbase';


const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching items for the calendar.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load calendar items: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object') {
      if (error.data.message && typeof error.data.message === 'string') {
        message = error.data.message;
      }
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    }

    if ('status' in error && error.status !== 0) {
      const status = error.status;
      if (status === 404) message = `A required data collection was not found (404).`;
      else if (status === 403) message = `You do not have permission to view items for the calendar (403).`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

const ALMOST_DUE_DAYS = 3;

function CalendarDayContent({ date, tasksForDay }: { date: Date; tasksForDay: CalendarEvent[] }) {
  const dayNumber = format(date, "d");
  
  // Only show dots for tasks that actually start on this day to avoid clutter
  const tasksStartingOnDay = tasksForDay.filter(task => isSameDay(new Date(task.startDate), date));
  
  const maxDots = 4;
  const dotCount = Math.min(tasksStartingOnDay.length, maxDots);

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center">
      <span>{dayNumber}</span>
      {dotCount > 0 && (
        <div className="absolute -bottom-1 flex items-center justify-center">
          {Array.from({ length: dotCount }).map((_, i) => (
            <Dot key={i} className="h-6 w-6 -mx-2 text-primary opacity-100" />
          ))}
        </div>
      )}
    </div>
  );
}

const getPriorityBadgeVariant = (priority?: string) => {
  if (!priority) return "default";
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return "destructive";
    case "high": return "destructive";
    case "medium": return "secondary";
    case "low": return "outline";
    default: return "default";
  }
};


export default function CalendarPage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [displayedEvents, setDisplayedEvents] = useState<CalendarEvent[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("personal");
  
  const [month, setMonth] = useState(new Date());

  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: startOfDay(new Date()),
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStartDayRef = useRef<Date | null>(null);

  const [newTaskDate, setNewTaskDate] = useState<Date | undefined>();
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);


  const handleDayMouseDown = (day: Date, modifiers: DayModifiers) => {
    // if (modifiers.disabled) return; // This was preventing selection of past dates
    setIsDragging(true);
    dragStartDayRef.current = day;
    setRange({ from: day, to: day });
  };

  const handleDayMouseEnter = (day: Date, modifiers: DayModifiers) => {
    if (isDragging && dragStartDayRef.current) { // Removed !modifiers.disabled
      const start = dragStartDayRef.current;
      if (start <= day) {
        setRange({ from: start, to: day });
      } else {
        setRange({ from: day, to: start });
      }
    }
  };
  
  const handleDayClick = (day: Date, modifiers: DayModifiers) => {
    // if (modifiers.disabled) return; // This was preventing selection of past dates
    setRange({ from: day, to: day });
  };

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartDayRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  const fetchCalendarData = useCallback(async (pb: PocketBase | null, tab: string, currentUserId: string, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true); 
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      let fetchedEvents: CalendarEvent[] = [];
       if (tab === 'personal') {
          const projectionHorizon = addYears(new Date(), 2);
          fetchedEvents = await getPersonalEvents(pb, currentUserId, { signal, projectionHorizon });
      } else { // 'task' tab
          const projectionHorizon = addYears(new Date(), 2);
          fetchedEvents = await getCalendarEvents(pb, { signal, projectionHorizon }); 
      }
      setDisplayedEvents(fetchedEvents);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (isAutocancel) {
        console.warn(`Calendar data fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Calendar Data", description: detailedError, variant: "destructive" });
        console.warn("Error fetching data for calendar (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient && user) {
      fetchCalendarData(pbClient, activeTab, user.id, controller.signal);
    } else {
      setIsLoading(true); 
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, user, activeTab, fetchCalendarData]);


  const eventsForView = useMemo(() => {
    let filtered = displayedEvents;
    
    if (filterPriority !== "all") {
        filtered = filtered.filter(event => event.priority === filterPriority);
    }

    if (activeTab === 'task' && filterStatus !== "all") {
        filtered = filtered.filter(event => event.status === filterStatus);
    }

    return filtered;
  }, [displayedEvents, activeTab, filterPriority, filterStatus]);

  const { tasksByDay, statusModifiers } = useMemo(() => {
    const tasksByDayMap = new Map<string, CalendarEvent[]>();
    const statusModifiersMap = {
      completed: new Set<number>(),
      overdue: new Set<number>(),
      almostDue: new Set<number>(),
      active: new Set<number>(),
      validation: new Set<number>(),
    };

    const today = startOfDay(new Date());

    for (const event of eventsForView) {
      if (!event.startDate) continue;
      const eventStartDateObj = new Date(event.startDate);
      if (!isValid(eventStartDateObj)) continue;

      const isValidationTask = event.task_type === 'VALIDATION_PROJECT' || event.task_type === 'VALIDATION_STEP';

      if (isValidationTask && event.endDate && isValid(new Date(event.endDate))) {
        const eventEndDateObj = new Date(event.endDate);
        const start = startOfDay(eventStartDateObj);
        const end = startOfDay(eventEndDateObj);

        for (let day = start; day <= end; day = addDays(day, 1)) {
            const dateKey = format(day, "yyyy-MM-dd");
            if (!tasksByDayMap.has(dateKey)) {
                tasksByDayMap.set(dateKey, []);
            }
            if (!tasksByDayMap.get(dateKey)!.find(e => e.id === event.id)) {
              tasksByDayMap.get(dateKey)!.push(event);
            }
            statusModifiersMap.validation.add(day.getTime());
        }
      } else {
        const eventStartDateAtMidnight = startOfDay(eventStartDateObj);
        const dateKey = format(eventStartDateAtMidnight, "yyyy-MM-dd");

        if (!tasksByDayMap.has(dateKey)) {
          tasksByDayMap.set(dateKey, []);
        }
        if (!tasksByDayMap.get(dateKey)!.find(e => e.id === event.id)) {
            tasksByDayMap.get(dateKey)!.push(event);
        }
        
        if (activeTab === 'task' && event.status) {
          if (!event.endDate || !isValid(new Date(event.endDate))) {
              continue;
          }
          const eventDueDateObj = new Date(event.endDate);
          if (!isValid(eventDueDateObj)) continue;
          
          const eventDueDateStartOfDay = startOfDay(eventDueDateObj);

          if (event.status === "Done") {
            statusModifiersMap.completed.add(eventDueDateStartOfDay.getTime());
          } else if (isPast(eventDueDateStartOfDay) && !isSameDay(eventDueDateStartOfDay, today)) {
            statusModifiersMap.overdue.add(eventDueDateStartOfDay.getTime());
          } else {
            const diffDays = differenceInCalendarDays(eventDueDateStartOfDay, today);
            if (diffDays >= 0 && diffDays < ALMOST_DUE_DAYS) {
              statusModifiersMap.almostDue.add(eventDueDateStartOfDay.getTime());
            } else if (isFuture(eventDueDateStartOfDay) || isSameDay(eventDueDateStartOfDay, today)) {
              statusModifiersMap.active.add(eventDueDateStartOfDay.getTime());
            }
          }
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
        validation: Array.from(statusModifiersMap.validation).map(t => new Date(t)),
      },
    };
  }, [eventsForView, activeTab]);

  const eventsForSelectedRange = useMemo(() => {
    if (!range?.from) return [];
    const from = startOfDay(range.from);
    const to = range.to ? startOfDay(range.to) : from;

    const uniqueEvents = new Map<string, CalendarEvent>();
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const dateKey = format(day, "yyyy-MM-dd");
      if (tasksByDay.has(dateKey)) {
        tasksByDay.get(dateKey)!.forEach(event => {
          uniqueEvents.set(event.id, event);
        });
      }
    }
    return Array.from(uniqueEvents.values())
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [range, tasksByDay]);

  const refetchEvents = () => {
    if (pbClient && user) {
      fetchCalendarData(pbClient, activeTab, user.id);
    }
  };

  const handleDataChanged = () => {
    refetchEvents();
  };
  
  const handleHourSlotClick = (date: Date) => {
    setNewTaskDate(date);
  };
  
  const closeNewTaskDialog = () => {
    setNewTaskDate(undefined);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setEditingEvent(event);
  };

  const closeEditDialog = () => {
    setEditingEvent(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!pbClient) return;
    try {
      await deletePersonalEvent(pbClient, eventId);
      toast({ title: "Event Deleted", description: "The event has been removed from your calendar." });
      refetchEvents();
      closeEditDialog();
    } catch (error: any) {
      toast({ title: "Error Deleting Event", description: getDetailedErrorMessage(error), variant: "destructive" });
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Calendar</h1>
        <div className="flex items-center gap-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="personal">Personal Calendar</TabsTrigger>
                <TabsTrigger value="task">Task Calendar</TabsTrigger>
              </TabsList>
            </Tabs>
             {activeTab === 'personal' && (
                <>
                  <Dialog open={!!newTaskDate} onOpenChange={(isOpen) => !isOpen && closeNewTaskDialog()}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add a New Personal Event</DialogTitle>
                      </DialogHeader>
                      <QuickTaskForm
                        onTaskCreated={handleDataChanged}
                        onDialogClose={closeNewTaskDialog}
                        defaultDate={newTaskDate}
                      />
                    </DialogContent>
                  </Dialog>
                  {/* Edit Dialog */}
                  <Dialog open={!!editingEvent} onOpenChange={(isOpen) => !isOpen && closeEditDialog()}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Personal Event</DialogTitle>
                      </DialogHeader>
                      <QuickTaskForm
                        eventToEdit={editingEvent!}
                        onTaskCreated={handleDataChanged}
                        onDialogClose={closeEditDialog}
                        onDelete={handleDeleteEvent}
                      />
                    </DialogContent>
                  </Dialog>
                </>
            )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading calendar...</p>
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
            {activeTab === 'task' && (
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
                        onDayMouseDown={handleDayMouseDown}
                        onDayMouseEnter={handleDayMouseEnter}
                        onDayClick={handleDayClick}
                        onSelect={undefined}
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
                        validation: "bg-validation",
                        }} 
                        components={{
                        DayContent: (props) => <CalendarDayContent date={props.date} tasksForDay={tasksByDay.get(format(props.date, "yyyy-MM-dd")) || []} />
                        }}
                    />
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <CardTitle className="font-headline">Tasks for: {selectedRangeText}</CardTitle>
                                <CardDescription>
                                    {eventsForSelectedRange.length} task(s) found in the selected period for the Task calendar.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as TaskPriority | 'all')}>
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Filter by priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Priorities</SelectItem>
                                        {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {activeTab === 'task' && (
                                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TaskStatus | 'all')}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="Filter by status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            {TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                    {eventsForSelectedRange.length > 0 ? (
                        <ul className="space-y-4">
                        {eventsForSelectedRange.map(event => (
                            <li key={event.id} className="p-4 rounded-md border bg-card hover:bg-muted/50 transition-colors">
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-grow">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant={getPriorityBadgeVariant(event.priority)}>{event.priority || 'N/A'}</Badge>
                                    <h3 className="font-semibold">{event.title}</h3>
                                </div>
                                {event.description && <p className="text-sm text-muted-foreground mt-1">{event.description}</p>}
                                {typeof event.progress === 'number' && (
                                    <div className="mt-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-muted-foreground">Progress</span>
                                        <span className="text-xs font-medium">{event.progress}%</span>
                                    </div>
                                    <Progress value={event.progress} className="h-2" />
                                    </div>
                                )}
                                </div>
                                <div className="text-right flex-shrink-0 ml-4">
                                <p className="text-sm font-medium">{format(new Date(event.startDate), "MMM dd")}</p>
                                <p className={cn("text-xs mt-1", event.status === "Done" ? "text-green-600" : "text-muted-foreground")}>{event.status}</p>
                                </div>
                            </div>
                            </li>
                        ))}
                        </ul>
                    ) : (
                        <p className="text-muted-foreground py-8 text-center">No tasks scheduled for the selected period matching your filters.</p>
                    )}
                    </CardContent>
                </Card>
                </>
            )}

            {activeTab === 'personal' && (
                 <WeeklyView
                    events={eventsForView}
                    onHourSlotClick={handleHourSlotClick}
                    onEventClick={handleEventClick}
                 />
            )}
        </>
      )}
    </div>
  );
}
