
"use client";

import type { Task, TaskStatus } from '@/lib/types';
import {
  addDays,
  differenceInDays,
  eachWeekOfInterval,
  format,
  // getISOWeek, // No longer used
  startOfDay,
  isSameDay,
  isWithinInterval,
  max,
  min,
  isValid,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth
} from 'date-fns';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import type PocketBase from "pocketbase";

const ROW_HEIGHT = 48;
const SIDEBAR_WIDTH = 450; // Increased to accommodate more details
const TASK_BAR_VERTICAL_PADDING = 8;
const GANTT_VIEW_MONTHS = 3;
const MILESTONE_SIZE = 16; // px

const MIN_DAY_CELL_WIDTH = 15;
const MAX_DAY_CELL_WIDTH = 60;
const DEFAULT_DAY_CELL_WIDTH = 30;

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
  const [dayCellWidth, setDayCellWidth] = useState<number>(DEFAULT_DAY_CELL_WIDTH);

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

    const processedTasks = allTasks.map(task => {
      const taskStartDateObj = startOfDay(new Date(task.startDate!));
      const taskDueDateObj = startOfDay(new Date(task.dueDate!));
      return {
        ...task,
        startDate: taskStartDateObj,
        dueDate: taskDueDateObj,
        progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
        isMilestone: task.isMilestone === true ||
                     (task.isMilestone !== false &&
                      isValid(taskStartDateObj) && isValid(taskDueDateObj) &&
                      isSameDay(taskStartDateObj, taskDueDateObj)),
        dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      };
    });

    const currentChartStartDate = viewStartDate;
    const currentChartEndDate = endOfMonth(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1));

    const tasksToDisplay = processedTasks.filter(task =>
        (task.startDate <= currentChartEndDate && task.dueDate >= currentChartStartDate)
    ).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());


    const totalDaysInView = differenceInDays(currentChartEndDate, currentChartStartDate) + 1;

    const weeksInView = totalDaysInView > 0 ? eachWeekOfInterval(
      { start: currentChartStartDate, end: currentChartEndDate },
      { weekStartsOn: 1 } // Assuming Monday is the start of the week
    ) : [];

    const getMonthYear = (date: Date) => format(date, 'MMM yyyy');
    const monthHeadersData: { name: string; span: number }[] = [];

    if (weeksInView.length > 0) {
      let currentMonthStr = getMonthYear(weeksInView[0]);
      let spanCount = 0;
      let currentDayPtr = new Date(currentChartStartDate);
      
      const monthSpans: {[key: string]: number} = {};

      while(currentDayPtr <= currentChartEndDate) {
        const monthKey = getMonthYear(currentDayPtr);
        monthSpans[monthKey] = (monthSpans[monthKey] || 0) + 1;
        currentDayPtr = addDays(currentDayPtr, 1);
      }
      
      Object.entries(monthSpans).forEach(([name, daysInMonth]) => {
          // A "span" here is number of day cells, not week cells
          monthHeadersData.push({ name, span: daysInMonth });
      });
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

  const handleZoomIn = () => {
    setDayCellWidth(prev => Math.min(MAX_DAY_CELL_WIDTH, prev + 5));
  };

  const handleZoomOut = () => {
    setDayCellWidth(prev => Math.max(MIN_DAY_CELL_WIDTH, prev - 5));
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
    ? (differenceInDays(today, chartStartDate) * dayCellWidth)
    : 0;

  const timelineGridWidth = totalDaysInView * dayCellWidth;


  return (
    <div className="gantt-chart-container text-xs select-none" style={{ minWidth: SIDEBAR_WIDTH + timelineGridWidth }}>
      {/* Control Header */}
      <div className="flex justify-between items-center p-2 border-b border-border bg-card sticky top-0 z-30">
         <h2 className="text-lg font-semibold text-card-foreground">Project Timeline</h2>
         <div className="flex items-center gap-2">
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomOut} disabled={dayCellWidth <= MIN_DAY_CELL_WIDTH} title="Zoom Out">
                <ZoomOut className="h-4 w-4" />
            </ShadcnButton>
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomIn} disabled={dayCellWidth >= MAX_DAY_CELL_WIDTH} title="Zoom In">
                <ZoomIn className="h-4 w-4" />
            </ShadcnButton>
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
        {/* Month and Day Headers */}
        <div className="overflow-hidden">
          {/* Month Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: monthHeaders.map(m => `${m.span * dayCellWidth}px`).join(' ') }}>
            {monthHeaders.map((month, index) => (
              <div
                key={index}
                className="flex items-center justify-center border-r border-border font-semibold text-xs"
                // style={{ gridColumn: `span ${month.span}` }} // grid-template-columns on parent handles span
              >
                {month.name}
              </div>
            ))}
          </div>
          {/* Day Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${totalDaysInView}, ${dayCellWidth}px)`}}>
            {Array.from({ length: totalDaysInView }).map((_, dayIndex) => {
                const day = addDays(chartStartDate, dayIndex);
                return (
                  <div
                    key={`${dayIndex}`}
                    className={cn(
                        "flex items-center justify-center border-r border-border text-muted-foreground text-[10px]",
                        isSameDay(day, today) ? "bg-blue-100 dark:bg-blue-900/50" : ""
                    )}
                    title={format(day, 'EEE, MMM d')}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })
            }
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
          if (!isValid(task.startDate) || !isValid(task.dueDate)) return null;

          const taskStartActual = task.startDate;
          const taskEndActual = task.dueDate;

          const taskStartInView = max([taskStartActual, chartStartDate]);
          const taskEndInView = min([taskEndActual, chartEndDate]);

          if (taskStartInView > taskEndInView && !task.isMilestone) return null;

          const taskStartDayOffset = differenceInDays(taskStartInView, chartStartDate);
          const taskDurationInViewDays = task.isMilestone ? 1 : differenceInDays(taskEndInView, taskStartInView) + 1;

          if (taskDurationInViewDays <= 0 && !task.isMilestone) return null;

          let barLeftPosition = taskStartDayOffset * dayCellWidth;
          if (task.isMilestone) {
            // For milestone, center it within its day cell
            barLeftPosition += (dayCellWidth / 2) - (MILESTONE_SIZE / 2);
          }

          const barWidth = task.isMilestone ? MILESTONE_SIZE : taskDurationInViewDays * dayCellWidth;
          
          const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING - 4;
          const taskBarTop = (ROW_HEIGHT - taskBarHeight) / 2;
          
          const milestoneTop = (ROW_HEIGHT - MILESTONE_SIZE) / 2;

          const tooltipLines = [
            `Task: ${task.title}`,
            `Status: ${task.status}`,
            `Priority: ${task.priority}`,
            `Progress: ${task.progress}%`,
            `Dates: ${format(taskStartActual, 'MMM d, yyyy')} - ${format(taskEndActual, 'MMM d, yyyy')}`,
            `Assigned to: ${task.assignedTo_text || "Unassigned"}`,
            `Depends on: ${task.dependencies && task.dependencies.length > 0 ? task.dependencies.join(', ') : "None"}`
          ];
          const tooltipText = tooltipLines.join('\n');
          
          if (task.isMilestone && !isWithinInterval(taskStartActual, { start: chartStartDate, end: chartEndDate })) {
            return null;
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
                      "absolute transition-all duration-150 ease-in-out group cursor-pointer",
                      getTaskBarColor(task.status, task.isMilestone),
                      !task.isMilestone && "rounded-sm"
                    )}
                    style={{
                      left: `${barLeftPosition}px`,
                      width: task.isMilestone ? `${MILESTONE_SIZE}px` : `${Math.max(5, barWidth)}px`, // Ensure min width for visibility
                      height: task.isMilestone ? `${MILESTONE_SIZE}px` : `${taskBarHeight}px`,
                      top: task.isMilestone ? `${milestoneTop}px` : `${taskBarTop}px`,
                    }}
                  >
                    {!task.isMilestone && task.status?.toLowerCase() !== 'done' && task.progress !== undefined && task.progress > 0 && (
                       <div
                          className="absolute top-0 left-0 h-full bg-black/40 rounded-sm"
                          style={{ width: `${task.progress}%`}}
                       />
                    )}
                    {task.isMilestone && (
                       <div className="absolute inset-0 flex items-center justify-center">
                         <svg viewBox="0 0 100 100" className="w-full h-full fill-current text-white/80" preserveAspectRatio="none">
                           <polygon points="50,0 100,50 50,100 0,50" />
                         </svg>
                       </div>
                    )}
                    {!task.isMilestone && barWidth > (dayCellWidth * 0.75) && ( // Show title in bar if enough space
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
