
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
  min
} from 'date-fns';
import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import type PocketBase from "pocketbase";

interface GanttChartProps {
  // tasks prop removed as the component will fetch its own data
}

const DAY_CELL_WIDTH = 30; 
const ROW_HEIGHT = 48;
const SIDEBAR_WIDTH = 450; 
const HEADER_HEIGHT = 60; 
const TASK_BAR_VERTICAL_PADDING = 8; 

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


const GanttChart: React.FC<GanttChartProps> = () => {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimelineTasks = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pb, { signal });
      setTasks(fetchedTasks.filter(task => task.startDate && task.dueDate));
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
  
  const validTasks = tasks.map(task => ({
    ...task,
    startDate: startOfDay(new Date(task.startDate!)),
    dueDate: startOfDay(new Date(task.dueDate!)),
    progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
    isMilestone: task.isMilestone === true || (task.isMilestone !== false && isSameDay(new Date(task.startDate!), new Date(task.dueDate!))),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
  }));

  if (validTasks.length === 0 && !isLoading && !error) {
    return (
        <div className="text-center py-10 text-muted-foreground min-h-[300px]">
            <p>No tasks with both start and due dates found to display on the timeline.</p>
            <p className="text-xs mt-1">Ensure tasks have valid start and due dates assigned.</p>
        </div>
    );
  }


  const overallStartDate = validTasks.length > 0 ? min(validTasks.map(t => t.startDate)) : startOfDay(new Date());
  const overallEndDate = validTasks.length > 0 ? max(validTasks.map(t => t.dueDate)) : addDays(startOfDay(new Date()), 30);
  
  const chartStartDate = addDays(overallStartDate, -2); 
  const chartEndDate = addDays(overallEndDate, 14); 

  const totalDaysInChart = differenceInDays(chartEndDate, chartStartDate) + 1;
  if (totalDaysInChart <= 0) {
     return <div className="p-4 text-center text-muted-foreground">Invalid date range for chart.</div>;
  }


  const weeksInChart = eachWeekOfInterval(
    { start: chartStartDate, end: chartEndDate },
    { weekStartsOn: 1 } 
  );

  const getMonthYear = (date: Date) => format(date, 'MMM yyyy');
  const monthHeaders: { name: string; span: number }[] = [];
  
  if (weeksInChart.length > 0) {
    let currentMonth = getMonthYear(weeksInChart[0]);
    let spanCount = 0;
    for (const weekStart of weeksInChart) {
      const monthYear = getMonthYear(weekStart);
      if (monthYear === currentMonth) {
        spanCount++;
      } else {
        monthHeaders.push({ name: currentMonth, span: spanCount });
        currentMonth = monthYear;
        spanCount = 1;
      }
    }
    monthHeaders.push({ name: currentMonth, span: spanCount }); // Add the last month
  }


  const today = startOfDay(new Date());
  const showTodayLine = isWithinInterval(today, { start: chartStartDate, end: chartEndDate });

  return (
    <div className="gantt-chart-container text-xs select-none" style={{ minWidth: SIDEBAR_WIDTH + (weeksInChart.length * DAY_CELL_WIDTH) }}>
      {/* Headers */}
      <div className="sticky top-0 z-20 bg-card grid" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`}}>
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
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH}px, 1fr))`}}>
            {monthHeaders.map((month, index) => (
              <div
                key={index}
                className="flex items-center justify-center border-r border-border font-semibold text-xs"
                style={{ gridColumn: `span ${month.span}` }}
              >
                {month.name}
              </div>
            ))}
            {weeksInChart.length > 0 && monthHeaders.reduce((acc, curr) => acc + curr.span, 0) < weeksInChart.length && (
                <div className="border-r border-border"></div>
            )}
          </div>
          {/* Week Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH}px, 1fr))`}}>
            {weeksInChart.map((weekStart, index) => (
              <div key={index} className="flex items-center justify-center border-r border-border text-muted-foreground text-[10px]">
                W{getISOWeek(weekStart)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Rows and Timeline Grid */}
      <div className="relative">
        {/* "Today" Line */}
        {showTodayLine && (
             <div 
                className="absolute top-0 bottom-0 w-[2px] bg-red-500/70 z-10"
                style={{ left: `${(differenceInDays(today, chartStartDate) / totalDaysInChart) * (weeksInChart.length * DAY_CELL_WIDTH) }px` }}
                title={`Today: ${format(today, 'PPP')}`}
              >
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] px-0.5 rounded-sm">TODAY</div>
              </div>
        )}


        {validTasks.map((task, taskIndex) => {
          const taskStartDayIndex = differenceInDays(task.startDate, chartStartDate);
          const taskEndDayIndex = Math.max(taskStartDayIndex, differenceInDays(task.dueDate, chartStartDate));
          
          const barLeftPosition = (taskStartDayIndex / totalDaysInChart) * (weeksInChart.length * DAY_CELL_WIDTH);

          const taskDurationDays = Math.max(1, differenceInDays(task.dueDate, task.startDate) + 1);
          const barWidth = (taskDurationDays / totalDaysInChart) * (weeksInChart.length * DAY_CELL_WIDTH);
          
          const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING - 4; 
          const taskBarTop = (ROW_HEIGHT - taskBarHeight) / 2;

          let tooltipText = `${task.title}: ${task.progress}% (${format(task.startDate, 'P')} - ${format(task.dueDate, 'P')})`;
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
                <span className="text-center text-[10px]">{format(task.startDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px]">{format(task.dueDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
              </div>

              {/* Task Bar Pane */}
              <div className="relative border-r border-border overflow-hidden">
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
