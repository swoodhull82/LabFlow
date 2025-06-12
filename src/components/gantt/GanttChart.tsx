
"use client";

import type { Task, TaskStatus } from '@/lib/types';
import { 
  addDays, 
  differenceInDays, 
  eachWeekOfInterval, 
  format, 
  getISOWeek, 
  startOfDay, 
  isSameDay,
  isWithinInterval,
  max,
  min,
  isValid,
  addMonths, // Added
  subMonths, // Added
  startOfMonth, // Added
  endOfMonth // Added
} from 'date-fns';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react"; // Added Chevrons
import { Button as ShadcnButton } from "@/components/ui/button"; // Renamed to avoid conflict
import type PocketBase from "pocketbase";

const DAY_CELL_WIDTH = 30; 
const ROW_HEIGHT = 48;
const SIDEBAR_WIDTH = 450; 
// HEADER_HEIGHT is implicitly handled by the two 30px rows
const TASK_BAR_VERTICAL_PADDING = 8; 
const GANTT_VIEW_MONTHS = 3; // Number of months to display in the view

const getTaskBarColor = (status?: TaskStatus, isMilestone?: boolean): string => {
  if (isMilestone) return 'bg-purple-500 hover:bg-purple-600'; 
  if (!status) return 'bg-primary hover:bg-primary/90';
  switch (status.toLowerCase()) {
    case 'done':
      return 'bg-green-500 hover:bg-green-600';
    case 'in progress':
      return 'bg-blue-500 hover:bg-blue-600';
    case 'overdue':
      return 'bg-red-500 hover:bg-red-600';
    case 'blocked':
      return 'bg-orange-500 hover:bg-orange-600';
    case 'to do':
      return 'bg-gray-400 hover:bg-gray-500';
    default:
      return 'bg-primary hover:bg-primary/90';
  }
};

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching tasks for the timeline.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load timeline data: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
        message = error.originalError.message;
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }

    if ('status' in error && error.status !== 0) {
      const status = error.status;
      if (status === 404) message = `The 'tasks' collection was not found (404). ${message}`;
      else if (status === 403) message = `You do not have permission to view tasks (403). ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};


const GanttChart: React.FC = () => {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date>(startOfMonth(new Date()));

  const fetchTimelineTasks = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pb, { signal });
      const validRawTasks = fetchedTasks.filter(task => 
        task.startDate && task.dueDate &&
        isValid(new Date(task.startDate)) && isValid(new Date(task.dueDate))
      );
      setAllTasks(validRawTasks);

      if (validRawTasks.length > 0) {
        const projectMinDate = min(validRawTasks.map(t => startOfDay(new Date(t.startDate!))));
        setViewStartDate(startOfMonth(projectMinDate));
      } else {
        setViewStartDate(startOfMonth(new Date()));
      }

    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;
      
      if (isAutocancel) {
        console.warn(`GanttChart: Timeline tasks fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
        console.warn("GanttChart: Timeline tasks fetch (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
        console.warn("GanttChart: Error fetching tasks for timeline (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchTimelineTasks(pbClient, controller.signal);
    } else {
       setIsLoading(true);
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchTimelineTasks]);


  const chartData = useMemo(() => {
    if (allTasks.length === 0) {
      return {
        tasksToDisplay: [],
        chartStartDate: viewStartDate,
        chartEndDate: endOfMonth(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1)),
        totalDaysInView: 0,
        weeksInView: [],
        monthHeaders: [],
      };
    }

    const processedTasks = allTasks.map(task => ({
      ...task,
      startDate: startOfDay(new Date(task.startDate!)), 
      dueDate: startOfDay(new Date(task.dueDate!)),
      progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
      isMilestone: task.isMilestone === true || (task.isMilestone !== false && isSameDay(new Date(task.startDate!), new Date(task.dueDate!))),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    }));
    
    const currentChartStartDate = viewStartDate;
    const currentChartEndDate = endOfMonth(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1));

    const tasksToDisplay = processedTasks.filter(task => 
        (task.startDate <= currentChartEndDate && task.dueDate >= currentChartStartDate)
    ).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());


    const totalDaysInView = differenceInDays(currentChartEndDate, currentChartStartDate) + 1;
    
    const weeksInView = totalDaysInView > 0 ? eachWeekOfInterval(
      { start: currentChartStartDate, end: currentChartEndDate },
      { weekStartsOn: 1 } 
    ) : [];

    const getMonthYear = (date: Date) => format(date, 'MMM yyyy');
    const monthHeadersData: { name: string; span: number }[] = [];
    
    if (weeksInView.length > 0) {
      let currentMonthStr = getMonthYear(weeksInView[0]);
      let spanCount = 0;
      weeksInView.forEach(weekStart => {
        const monthYear = getMonthYear(weekStart);
        if (monthYear === currentMonthStr) {
          spanCount++;
        } else {
          monthHeadersData.push({ name: currentMonthStr, span: spanCount });
          currentMonthStr = monthYear;
          spanCount = 1;
        }
      });
      monthHeadersData.push({ name: currentMonthStr, span: spanCount });
    }

    return {
      tasksToDisplay,
      chartStartDate: currentChartStartDate,
      chartEndDate: currentChartEndDate,
      totalDaysInView,
      weeksInView,
      monthHeaders: monthHeadersData,
    };

  }, [allTasks, viewStartDate]);

  const { tasksToDisplay, chartStartDate, chartEndDate, totalDaysInView, weeksInView, monthHeaders } = chartData;

  const handlePrevMonth = () => {
    setViewStartDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setViewStartDate(prev => addMonths(prev, 1));
  };

  const refetchTasks = () => {
    if (pbClient) {
      fetchTimelineTasks(pbClient);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10 min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading timeline data...</p>
      </div>
    );
  }

  if (error && !isLoading) {
    return (
      <div className="text-center py-10 min-h-[300px]">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Failed to Load Timeline Data</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <ShadcnButton 
          onClick={refetchTasks} 
          className="mt-6"
        >
          Try Again
        </ShadcnButton>
      </div>
    );
  }
  
  if (allTasks.length === 0 && !isLoading && !error) {
    return (
        <div className="text-center py-10 text-muted-foreground min-h-[300px]">
            <p>No tasks found to display on the timeline.</p>
            <p className="text-xs mt-1">Ensure tasks have valid start and due dates assigned.</p>
        </div>
    );
  }
  if (tasksToDisplay.length === 0 && allTasks.length > 0 && !isLoading && !error) {
     return (
        <div className="text-center py-10 text-muted-foreground min-h-[300px]">
            <div className="flex justify-center items-center gap-2 mb-4">
                <ShadcnButton variant="outline" size="sm" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4 mr-1" /> Prev</ShadcnButton>
                <span className="font-medium text-lg">{format(viewStartDate, "MMMM yyyy")} - {format(addMonths(viewStartDate, GANTT_VIEW_MONTHS -1), "MMMM yyyy")}</span>
                <ShadcnButton variant="outline" size="sm" onClick={handleNextMonth}>Next <ChevronRight className="h-4 w-4 ml-1" /></ShadcnButton>
            </div>
            <p>No tasks fall within the current visible date range.</p>
            <p className="text-xs mt-1">Try adjusting the timeline view using the Prev/Next buttons.</p>
        </div>
    );
  }


  if (totalDaysInView <= 0 && !isLoading && !error) {
     return <div className="p-4 text-center text-muted-foreground">Invalid date range for chart. Try navigating.</div>;
  }

  const today = startOfDay(new Date());
  const showTodayLine = isWithinInterval(today, { start: chartStartDate, end: chartEndDate });
  const todayLineLeftPosition = showTodayLine && totalDaysInView > 0
    ? (differenceInDays(today, chartStartDate) * DAY_CELL_WIDTH)
    : 0;
  
  const timelineGridWidth = weeksInView.length * 7 * DAY_CELL_WIDTH;


  return (
    <div className="gantt-chart-container text-xs select-none" style={{ minWidth: SIDEBAR_WIDTH + timelineGridWidth }}>
      {/* Control Header */}
      <div className="flex justify-between items-center p-2 border-b border-border bg-card sticky top-0 z-30">
         <h2 className="text-lg font-semibold text-card-foreground">Project Timeline</h2>
         <div className="flex items-center gap-2">
            <ShadcnButton variant="outline" size="sm" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
            </ShadcnButton>
            <span className="font-medium text-sm text-muted-foreground tabular-nums">
                {format(viewStartDate, "MMM yyyy")} - {format(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1), "MMM yyyy")}
            </span>
            <ShadcnButton variant="outline" size="sm" onClick={handleNextMonth}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
            </ShadcnButton>
         </div>
      </div>
      
      {/* Headers */}
      <div className="sticky top-[57px] z-20 bg-card grid" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`}}>
        {/* Left Panel Header */}
        <div className="h-[60px] border-b border-r border-border flex items-center p-2 font-semibold text-sm">
          <div className="grid grid-cols-[40px_1fr_70px_70px_60px] w-full items-center gap-2">
            <span className="text-center text-muted-foreground text-[10px] uppercase">WBS</span>
            <span className="text-muted-foreground text-[10px] uppercase">Task Name</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">Start</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">End</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">Prog.</span>
          </div>
        </div>
        {/* Month and Week Headers */}
        <div className="overflow-hidden">
          {/* Month Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInView.length}, ${DAY_CELL_WIDTH * 7}px)`}}>
            {monthHeaders.map((month, index) => (
              <div
                key={index}
                className="flex items-center justify-center border-r border-border font-semibold text-xs"
                style={{ gridColumn: `span ${month.span}` }}
              >
                {month.name}
              </div>
            ))}
            {weeksInView.length > 0 && monthHeaders.reduce((acc, curr) => acc + curr.span, 0) < weeksInView.length && (
                <div className="border-r border-border"></div> // Ensure right border for last partial month if any
            )}
          </div>
          {/* Week Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInView.length * 7}, ${DAY_CELL_WIDTH}px)`}}>
            {weeksInView.flatMap((weekStart, weekIndex) => 
              Array.from({ length: 7 }).map((_, dayIndex) => {
                const day = addDays(weekStart, dayIndex);
                const isCurrentMonthDay = day >= chartStartDate && day <= chartEndDate;
                return (
                  <div 
                    key={`${weekIndex}-${dayIndex}`} 
                    className={cn(
                        "flex items-center justify-center border-r border-border text-muted-foreground text-[10px]",
                        isSameDay(day, today) ? "bg-blue-100 dark:bg-blue-900/50" : "",
                        !isCurrentMonthDay ? "opacity-50" : ""
                    )}
                    title={format(day, 'EEE, MMM d')}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Task Rows and Timeline Grid */}
      <div className="relative">
        {/* "Today" Line */}
        {showTodayLine && totalDaysInView > 0 && (
             <div 
                className="absolute top-0 bottom-0 w-[2px] bg-red-500/70 z-10"
                style={{ left: `${todayLineLeftPosition}px` }}
                title={`Today: ${format(today, 'PPP')}`}
              >
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] px-0.5 rounded-sm">TODAY</div>
              </div>
        )}


        {tasksToDisplay.map((task, taskIndex) => {
          // Ensure dates are valid before proceeding with calculations
          if (!isValid(task.startDate) || !isValid(task.dueDate)) return null;

          const taskStartActual = task.startDate;
          const taskEndActual = task.dueDate;

          // Clip task start/end to be within the current view window for rendering
          const taskStartInView = max([taskStartActual, chartStartDate]);
          const taskEndInView = min([taskEndActual, chartEndDate]);
          
          if (taskStartInView > taskEndInView) return null; // Task is completely outside the clipped view

          const taskStartDayOffset = differenceInDays(taskStartInView, chartStartDate);
          const taskDurationInViewDays = differenceInDays(taskEndInView, taskStartInView) + 1;

          if (taskDurationInViewDays <= 0) return null;

          const barLeftPosition = taskStartDayOffset * DAY_CELL_WIDTH;
          const barWidth = taskDurationInViewDays * DAY_CELL_WIDTH;
          
          const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING - 4; 
          const taskBarTop = (ROW_HEIGHT - taskBarHeight) / 2;

          let tooltipText = `${task.title}: ${task.progress}% (${format(taskStartActual, 'P')} - ${format(taskEndActual, 'P')})`;
          if (task.dependencies && task.dependencies.length > 0) {
            tooltipText += ` | Depends on: ${task.dependencies.join(', ')}`;
          }

          return (
            <div
              key={task.id}
              className="grid border-b border-border hover:bg-muted/10 relative"
              style={{ 
                gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
                height: `${ROW_HEIGHT}px`
              }}
            >
              {/* Task Details Pane (Left Panel Row) */}
              <div className="grid grid-cols-[40px_1fr_70px_70px_60px] w-full items-center gap-2 p-2 border-r border-border">
                <span className="text-center text-muted-foreground">{taskIndex + 1}</span>
                <span className="font-medium truncate text-xs" title={task.title}>{task.title}</span>
                <span className="text-center text-[10px]">{format(taskStartActual, 'ddMMMyy')}</span>
                <span className="text-center text-[10px]">{format(taskEndActual, 'ddMMMyy')}</span>
                <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
              </div>

              {/* Task Bar Pane */}
              <div className="relative border-r border-border overflow-hidden" style={{width: `${timelineGridWidth}px`}}>
                {barWidth > 0 && (
                  <div
                    title={tooltipText}
                    className={cn(
                      "absolute rounded-sm transition-all duration-150 ease-in-out group cursor-pointer",
                      getTaskBarColor(task.status, task.isMilestone)
                    )}
                    style={{
                      left: `${barLeftPosition}px`,
                      width: `${Math.max(task.isMilestone ? 12 : 5, barWidth)}px`, 
                      height: `${taskBarHeight}px`,
                      top: `${taskBarTop}px`,
                    }}
                  >
                    {!task.isMilestone && task.progress !== undefined && task.progress > 0 && (
                       <div 
                          className="absolute top-0 left-0 h-full bg-black/20 rounded-sm"
                          style={{ width: `${task.progress}%`}}
                       />
                    )}
                    {task.isMilestone && (
                       <div className="absolute inset-0 flex items-center justify-center">
                         <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 fill-current text-white/80" preserveAspectRatio="none">
                           <polygon points="50,0 100,50 50,100 0,50" />
                         </svg>
                       </div>
                    )}
                    {!task.isMilestone && barWidth > (DAY_CELL_WIDTH * 0.75) && ( 
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-medium whitespace-nowrap overflow-hidden pr-1">
                        {task.title}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttChart;


    