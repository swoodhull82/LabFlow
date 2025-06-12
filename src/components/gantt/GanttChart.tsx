
"use client";

import type { Task, TaskStatus } from '@/lib/types';
import {
  addDays,
  differenceInDays,
  format,
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
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import type PocketBase from "pocketbase";

const ROW_HEIGHT = 48; // px, height of each task row
const LEFT_PANEL_WIDTH = 450; // px, width of the fixed task list panel
const TASK_BAR_VERTICAL_PADDING = 8; // px, vertical padding around the task bar within its row height
const GANTT_VIEW_MONTHS = 3; // Number of months visible in the timeline view by default
const MILESTONE_SIZE = 16; // px, size of the milestone diamond

const MIN_DAY_CELL_WIDTH = 15; // px
const MAX_DAY_CELL_WIDTH = 60; // px
const DEFAULT_DAY_CELL_WIDTH = 30; // px

const DEPENDENCY_LINE_OFFSET = 15; // px, for the horizontal part of the elbow connector
const ARROW_SIZE = 5; // px, for arrowhead marker

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
  
  const timelineScrollContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelScrollContainerRef = useRef<HTMLDivElement>(null);

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

    const getMonthYear = (date: Date) => format(date, 'MMM yyyy');
    const monthHeadersData: { name: string; span: number }[] = [];

    if (totalDaysInView > 0) {
      let currentDayPtr = new Date(currentChartStartDate);
      const monthSpans: {[key: string]: number} = {};
      while(currentDayPtr <= currentChartEndDate) {
        const monthKey = getMonthYear(currentDayPtr);
        monthSpans[monthKey] = (monthSpans[monthKey] || 0) + 1;
        currentDayPtr = addDays(currentDayPtr, 1);
      }
      Object.entries(monthSpans).forEach(([name, daysInMonth]) => {
          monthHeadersData.push({ name, span: daysInMonth });
      });
    }

    return {
      tasksToDisplay,
      chartStartDate: currentChartStartDate,
      chartEndDate: currentChartEndDate,
      totalDaysInView: totalDaysInView > 0 ? totalDaysInView : 0,
      monthHeaders: monthHeadersData,
    };
  }, [allTasks, viewStartDate]);

  const { tasksToDisplay, chartStartDate, chartEndDate, totalDaysInView, monthHeaders } = chartData;

  const taskRenderDetailsMap = useMemo(() => {
    const map = new Map<string, {
        task: Task & { startDate: Date; dueDate: Date; isMilestone: boolean; dependencies: string[] };
        index: number;
        barStartX: number;
        barEndX: number; // For non-milestones, this is barStartX + width
        barWidth: number;
        barCenterY: number;
        isMilestone: boolean;
    }>();

    tasksToDisplay.forEach((task, index) => {
        const taskStartActual = task.startDate;
        const taskEndActual = task.dueDate;
        
        const taskStartInView = max([taskStartActual, chartStartDate]);
        const taskEndInView = min([taskEndActual, chartEndDate]);
        
        if (taskStartInView > taskEndInView && !task.isMilestone) return;

        const taskStartDayOffset = differenceInDays(taskStartInView, chartStartDate);
        const taskDurationInViewDays = task.isMilestone ? 1 : differenceInDays(taskEndInView, taskStartInView) + 1;

        if (taskDurationInViewDays <= 0 && !task.isMilestone) return;

        let barLeftPosition = taskStartDayOffset * dayCellWidth;
        const barW = task.isMilestone ? MILESTONE_SIZE : taskDurationInViewDays * dayCellWidth;

        if (task.isMilestone) {
            barLeftPosition += (dayCellWidth / 2) - (MILESTONE_SIZE / 2);
        }
        
        const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING * 2; // Adjusted for padding on both sides
        const taskBarTop = TASK_BAR_VERTICAL_PADDING; // Relative to the row
        const milestoneTop = (ROW_HEIGHT - MILESTONE_SIZE) / 2; // Relative to the row

        map.set(task.id, {
            task,
            index,
            barStartX: barLeftPosition,
            barEndX: barLeftPosition + barW,
            barWidth: barW,
            barCenterY: (index * ROW_HEIGHT) + 
                        (task.isMilestone ? milestoneTop + MILESTONE_SIZE / 2 : taskBarTop + taskBarHeight / 2),
            isMilestone: !!task.isMilestone,
        });
    });
    return map;
  }, [tasksToDisplay, chartStartDate, chartEndDate, dayCellWidth]);


  const dependencyLines = useMemo(() => {
    const lines: { id: string, d: string }[] = [];
    tasksToDisplay.forEach((dependentTask) => {
        if (!dependentTask.dependencies || dependentTask.dependencies.length === 0) return;
        const dependentDetails = taskRenderDetailsMap.get(dependentTask.id);
        if (!dependentDetails) return;

        dependentTask.dependencies.forEach((predecessorId, depIndex) => {
            const predecessorDetails = taskRenderDetailsMap.get(predecessorId);
            if (!predecessorDetails) return;
            
            const fromX = predecessorDetails.isMilestone ? predecessorDetails.barStartX + MILESTONE_SIZE / 2 : predecessorDetails.barEndX;
            const fromY = predecessorDetails.barCenterY;
            const toX = dependentDetails.isMilestone ? dependentDetails.barStartX + MILESTONE_SIZE / 2 : dependentDetails.barStartX;
            const toY = dependentDetails.barCenterY;

            if (fromX >= toX && fromY === toY) return;

            const turnX = fromX + DEPENDENCY_LINE_OFFSET;
            const pathD = `M ${fromX} ${fromY} L ${turnX} ${fromY} L ${turnX} ${toY} L ${toX} ${toY}`;
            lines.push({ id: `dep-${predecessorId}-to-${dependentTask.id}-${depIndex}`, d: pathD });
        });
    });
    return lines;
  }, [tasksToDisplay, taskRenderDetailsMap]);

  const handlePrevMonth = () => setViewStartDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setViewStartDate(prev => addMonths(prev, 1));
  const handleZoomIn = () => setDayCellWidth(prev => Math.min(MAX_DAY_CELL_WIDTH, prev + 5));
  const handleZoomOut = () => setDayCellWidth(prev => Math.max(MIN_DAY_CELL_WIDTH, prev - 5));
  const refetchTasks = () => pbClient && fetchTimelineTasks(pbClient);

  useEffect(() => {
    // Basic vertical scroll synchronization
    // More advanced sync (e.g., accounting for different scroll speeds or momentum) is complex.
    let primaryScroller: 'left' | 'right' | null = null;

    const handleLeftScroll = () => {
      if (primaryScroller === 'right') return;
      primaryScroller = 'left';
      if (leftPanelScrollContainerRef.current && timelineScrollContainerRef.current) {
        // Sync vertical scroll of timeline grid to left panel's task list
        // This assumes the timelineScrollContainerRef's direct child (timeline-inner-content)
        // is the one that should have its scrollTop set.
        const rightInnerScroll = timelineScrollContainerRef.current.querySelector('.timeline-inner-content');
        if (rightInnerScroll) {
          rightInnerScroll.scrollTop = leftPanelScrollContainerRef.current.scrollTop;
        }
      }
      requestAnimationFrame(() => primaryScroller = null);
    };

    const handleRightScroll = () => {
      if (primaryScroller === 'left') return;
      primaryScroller = 'right';
      if (leftPanelScrollContainerRef.current && timelineScrollContainerRef.current) {
        // Sync vertical scroll of left panel to timeline grid
        const rightInnerScroll = timelineScrollContainerRef.current.querySelector('.timeline-inner-content');
        if (rightInnerScroll) {
          leftPanelScrollContainerRef.current.scrollTop = rightInnerScroll.scrollTop;
        }
      }
       requestAnimationFrame(() => primaryScroller = null);
    };
    
    const leftEl = leftPanelScrollContainerRef.current;
    const rightInnerEl = timelineScrollContainerRef.current?.querySelector('.timeline-inner-content');

    leftEl?.addEventListener('scroll', handleLeftScroll);
    rightInnerEl?.addEventListener('scroll', handleRightScroll);

    return () => {
      leftEl?.removeEventListener('scroll', handleLeftScroll);
      rightInnerEl?.removeEventListener('scroll', handleRightScroll);
    };
  }, [tasksToDisplay]); // Rerun if tasks change, as scroll heights might change


  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10 min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading timeline data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 min-h-[300px]">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Failed to Load Timeline Data</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <ShadcnButton onClick={refetchTasks} className="mt-6">Try Again</ShadcnButton>
      </div>
    );
  }
  
  const today = startOfDay(new Date());
  const showTodayLine = isWithinInterval(today, { start: chartStartDate, end: chartEndDate });
  const todayLineLeftPosition = showTodayLine && totalDaysInView > 0
    ? (differenceInDays(today, chartStartDate) * dayCellWidth)
    : 0;

  const timelineGridWidth = totalDaysInView * dayCellWidth;
  const timelineGridHeight = tasksToDisplay.length * ROW_HEIGHT;

  const renderNoTasksMessage = () => (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center text-sm">
        <p className="text-muted-foreground">No tasks found for current view.</p>
        <p className="text-xs mt-1 text-muted-foreground">
            {allTasks.length === 0 ? "Ensure tasks have valid start/due dates." : "Try adjusting date range or zoom."}
        </p>
    </div>
  );

  return (
    <div className="gantt-chart-root flex flex-col h-[calc(100vh-200px)] overflow-hidden"> {/* Adjust height as needed */}
      {/* Control Header */}
      <div className="flex justify-between items-center p-2 border-b border-border bg-card flex-shrink-0">
         <h2 className="text-lg font-semibold text-card-foreground">Project Timeline</h2>
         <div className="flex items-center gap-2">
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomOut} disabled={dayCellWidth <= MIN_DAY_CELL_WIDTH} title="Zoom Out"><ZoomOut className="h-4 w-4" /></ShadcnButton>
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomIn} disabled={dayCellWidth >= MAX_DAY_CELL_WIDTH} title="Zoom In"><ZoomIn className="h-4 w-4" /></ShadcnButton>
            <ShadcnButton variant="outline" size="sm" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4 mr-1" />Prev</ShadcnButton>
            <span className="font-medium text-sm text-muted-foreground tabular-nums">{format(viewStartDate, "MMM yyyy")} - {format(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1), "MMM yyyy")}</span>
            <ShadcnButton variant="outline" size="sm" onClick={handleNextMonth}>Next<ChevronRight className="h-4 w-4 ml-1" /></ShadcnButton>
         </div>
      </div>

      {/* Main Gantt Body (Left Panel + Right Scrollable Timeline) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed Left Panel (Task List) */}
        <div 
            style={{ width: `${LEFT_PANEL_WIDTH}px` }} 
            className="flex-shrink-0 bg-card border-r border-border flex flex-col"
        >
          <div className="h-[60px] flex items-center p-2 font-semibold text-xs border-b border-border flex-shrink-0 sticky top-0 bg-card z-20">
            <div className="grid grid-cols-[40px_1fr_70px_70px_60px] w-full items-center gap-2">
                <span className="text-center text-muted-foreground uppercase">WBS</span>
                <span className="text-muted-foreground uppercase">Task Name</span>
                <span className="text-center text-muted-foreground uppercase">Start</span>
                <span className="text-center text-muted-foreground uppercase">End</span>
                <span className="text-center text-muted-foreground uppercase">Prog.</span>
            </div>
          </div>
          <div ref={leftPanelScrollContainerRef} className="overflow-y-auto flex-1">
            {tasksToDisplay.length === 0 && !isLoading && renderNoTasksMessage()}
            {tasksToDisplay.map((task, taskIndex) => (
              <div 
                key={task.id} 
                className="grid grid-cols-[40px_1fr_70px_70px_60px] items-center gap-2 p-2 border-b border-border text-xs hover:bg-muted/50"
                style={{ height: `${ROW_HEIGHT}px` }}
              >
                <span className="text-center text-muted-foreground">{taskIndex + 1}</span>
                <span className="font-medium truncate" title={task.title}>{task.title}</span>
                <span className="text-center text-[10px]">{format(task.startDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px]">{format(task.dueDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Right Panel (Timeline) */}
        <div className="flex-1 overflow-x-auto" ref={timelineScrollContainerRef}>
           <div style={{ width: `${timelineGridWidth}px`, minWidth: '100%' }} className="relative timeline-inner-content">
            <div className="sticky top-0 z-20 bg-card">
              <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: monthHeaders.map(m => `${m.span * dayCellWidth}px`).join(' ') }}>
                {monthHeaders.map((month, index) => (
                  <div key={index} className="flex items-center justify-center border-r border-border font-semibold text-xs">{month.name}</div>
                ))}
              </div>
              <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${totalDaysInView > 0 ? totalDaysInView : 1}, ${dayCellWidth}px)`}}>
                {Array.from({ length: totalDaysInView > 0 ? totalDaysInView : 0 }).map((_, dayIndex) => {
                    const day = addDays(chartStartDate, dayIndex);
                    return (
                      <div key={`${dayIndex}`} className={cn("flex items-center justify-center border-r border-border text-muted-foreground text-[10px]", isSameDay(day, today) ? "bg-primary/10 dark:bg-primary/20" : "")} title={format(day, 'EEE, MMM d')}>
                        {format(day, 'd')}
                      </div>
                    );
                  })
                }
                 {totalDaysInView <= 0 && <div className="h-full col-span-1"></div>}
              </div>
            </div>

            {tasksToDisplay.length > 0 && (
              <div className="relative" style={{ height: `${timelineGridHeight}px` }}>
                {tasksToDisplay.map((_, taskIndex) => (
                    <div key={`row-line-${taskIndex}`} className="absolute left-0 right-0 border-b border-border/30" style={{ top: `${(taskIndex + 1) * ROW_HEIGHT -1}px`, height: '1px', zIndex: 1 }}></div>
                ))}
                
                {showTodayLine && totalDaysInView > 0 && (
                  <div className="absolute top-0 bottom-0 w-[2px] bg-destructive/70 z-[5]" style={{ left: `${todayLineLeftPosition}px` }} title={`Today: ${format(today, 'PPP')}`}>
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-destructive text-white text-[8px] px-0.5 rounded-sm">TODAY</div>
                  </div>
                )}

                {tasksToDisplay.map((task, taskIndex) => {
                  const taskDetails = taskRenderDetailsMap.get(task.id);
                  if (!taskDetails) return null;
                  const { barStartX, barWidth, isMilestone } = taskDetails;
                  
                  const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING * 2;
                  const taskBarTopOffset = TASK_BAR_VERTICAL_PADDING;
                  const milestoneTopOffset = (ROW_HEIGHT - MILESTONE_SIZE) / 2;

                  const tooltipLines = [
                    `Task: ${task.title}`, `Status: ${task.status}`, `Priority: ${task.priority}`,
                    `Progress: ${task.progress}%`,
                    `Dates: ${format(task.startDate, 'MMM d, yyyy')} - ${format(task.dueDate, 'MMM d, yyyy')}`,
                    `Assigned to: ${task.assignedTo_text || "Unassigned"}`,
                    `Depends on: ${task.dependencies && task.dependencies.length > 0 ? task.dependencies.map(depId => allTasks.find(t=>t.id===depId)?.title || depId).join(', ') : "None"}`
                  ];
                  const tooltipText = tooltipLines.join('\n');

                  return (
                    <div
                      key={task.id}
                      title={tooltipText}
                      className={cn(
                        "absolute transition-all duration-150 ease-in-out group cursor-pointer z-10",
                        getTaskBarColor(task.status, isMilestone),
                        !isMilestone && "rounded-sm"
                      )}
                      style={{
                        left: `${barStartX}px`,
                        width: `${barWidth < 0 ? 0 : barWidth}px`, // Ensure width is not negative
                        top: `${(taskIndex * ROW_HEIGHT) + (isMilestone ? milestoneTopOffset : taskBarTopOffset)}px`,
                        height: isMilestone ? `${MILESTONE_SIZE}px` : `${taskBarHeight}px`,
                      }}
                    >
                      {!isMilestone && task.status?.toLowerCase() !== 'done' && task.progress !== undefined && task.progress > 0 && barWidth > 0 && (
                        <div className="absolute top-0 left-0 h-full bg-black/40 rounded-sm" style={{ width: `${task.progress}%`}} />
                      )}
                      {isMilestone && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg viewBox="0 0 100 100" className="w-full h-full fill-current text-white/80" preserveAspectRatio="none">
                            <polygon points="50,0 100,50 50,100 0,50" />
                          </svg>
                        </div>
                      )}
                      {!isMilestone && barWidth > (dayCellWidth * 0.75) && (
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-medium whitespace-nowrap overflow-hidden pr-1">
                          {task.title}
                        </span>
                      )}
                    </div>
                  );
                })}

                {dependencyLines.length > 0 && (
                  <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    width={timelineGridWidth}
                    height={timelineGridHeight}
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ zIndex: 20 }} 
                  >
                    <defs>
                      <marker id="arrowhead" markerWidth={ARROW_SIZE*1.2} markerHeight={ARROW_SIZE*0.8} refX={ARROW_SIZE*1.1} refY={ARROW_SIZE*0.4} orient="auto-start-reverse">
                        <polygon points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE*0.4}, 0 ${ARROW_SIZE*0.8}`} fill="hsl(var(--foreground) / 0.6)" />
                      </marker>
                    </defs>
                    {dependencyLines.map(line => (
                      <path key={line.id} d={line.d} stroke="hsl(var(--foreground) / 0.6)" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)" />
                    ))}
                  </svg>
                )}
              </div>
            )}
            {tasksToDisplay.length === 0 && !isLoading && (
                <div style={{height: ROW_HEIGHT*3}} className="flex items-center justify-center">
                 {renderNoTasksMessage()}
                </div>
            )}
          </div>
        </div>
      </div>
    </div> 
  );
};

export default GanttChart;

    