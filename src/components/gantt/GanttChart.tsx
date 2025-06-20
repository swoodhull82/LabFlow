
"use client";

import type { Task, TaskStatus, TaskType, Employee } from '@/lib/types'; // Added Employee
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
import { getTasks, updateTask as updateTaskService, deleteTask as deleteTaskService, getEmployees as getEmployeesService } from "@/services/taskService"; // Assuming getEmployees is in taskService or a new service
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, GripVertical, PlusCircle, CornerDownRight, Trash2, Save, CalendarIcon, XCircle } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type PocketBase from "pocketbase";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { cva } from "class-variance-authority";


const ROW_HEIGHT = 48;
const LEFT_PANEL_WIDTH = 450;
const TASK_BAR_VERTICAL_PADDING = 8;
const GANTT_VIEW_MONTHS = 3;
const MILESTONE_SIZE = 16;

const MIN_DAY_CELL_WIDTH = 15;
const MAX_DAY_CELL_WIDTH = 60;
const DEFAULT_DAY_CELL_WIDTH = 30;

const DEPENDENCY_LINE_OFFSET = 12; 
const ARROW_SIZE = 4; 
const RESIZE_HANDLE_WIDTH = 8;
const MIN_TASK_DURATION_DAYS = 1;

const getTaskBarColor = (status?: TaskStatus, isMilestone?: boolean, taskType?: TaskType): string => {
  if (taskType === "VALIDATION_PROJECT" && isMilestone) return 'bg-purple-500 hover:bg-purple-600';
  if (taskType === "VALIDATION_STEP") return 'bg-teal-500 hover:bg-teal-600';
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

const getDetailedErrorMessage = (error: any, context?: string): string => {
  let message = `An unexpected error occurred while ${context || 'processing your request'}.`;
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = `Failed to connect to the server while ${context || 'processing'}. Please check your internet connection.`;
    } else if (error.data?.message) {
      message = error.data.message;
    } else if (error.message && !error.message.startsWith("PocketBase_ClientResponseError")) {
      message = error.message;
    } else if (error.originalError?.message) {
      message = error.originalError.message;
    }
     if ('status' in error && error.status && error.status !==0) {
      message = `${message} (Status: ${error.status})`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

interface DragState {
  type: 'drag' | 'resize-start' | 'resize-end';
  taskId: string;
  initialMouseX: number;
  originalStartDate: Date;
  originalDueDate: Date;
  currentMouseX?: number;
}

interface DependencyDrawState {
  sourceTaskId: string;
  sourceTaskBarEndX: number;
  sourceTaskBarCenterY: number;
  currentMouseX: number;
  currentMouseY: number;
}

interface GanttChartProps {
  filterTaskType?: TaskType | "ALL_EXCEPT_VALIDATION" | "VALIDATION_AND_ITS_STEPS";
  displayHeaderControls?: 'defaultTitle' | 'addValidationButton';
}

const quickEditFormSchema = z.object({
  title: z.string().min(1, "Title is required."),
  startDate: z.date().optional(),
  dueDate: z.date().optional(),
  isMilestone: z.boolean().optional(),
}).refine(data => {
    if (data.isMilestone && !data.startDate) {
      return false; // Milestone requires a start date
    }
    if (data.startDate && data.dueDate && !data.isMilestone && data.startDate > data.dueDate) {
        return false; // Start date must be before or same as due date for non-milestones
    }
    return true;
}, {
    message: "Start date must be valid. For milestones, date is required. For ranges, start must be <= due.",
    path: ["startDate"], // Generic path, specific error handling can be done in UI if needed
});
type QuickEditFormData = z.infer<typeof quickEditFormSchema>;


const GanttChart: React.FC<GanttChartProps> = ({ filterTaskType, displayHeaderControls = 'defaultTitle' }) => {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date>(startOfMonth(new Date()));
  const [dayCellWidth, setDayCellWidth] = useState<number>(DEFAULT_DAY_CELL_WIDTH);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dependencyDrawState, setDependencyDrawState] = useState<DependencyDrawState | null>(null);

  const timelineScrollContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelScrollContainerRef = useRef<HTMLDivElement>(null);
  const ganttBodyRef = useRef<HTMLDivElement>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const [quickEditTask, setQuickEditTask] = useState<Task | null>(null);
  const [isQuickEditPopoverOpen, setIsQuickEditPopoverOpen] = useState(false);


  const fetchTimelineTasks = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetchOptions: any = { signal };

      const fetchedTasks = await getTasks(pb, fetchOptions);
      const validRawTasks = fetchedTasks.filter(task =>
        task.startDate && task.dueDate &&
        isValid(new Date(task.startDate)) && isValid(new Date(task.dueDate))
      );
      setAllTasks(validRawTasks);

      if (validRawTasks.length > 0) {
        // Initial viewStartDate adjustment can be done here if needed, or rely on chartData memo
      } else {
        setViewStartDate(startOfMonth(new Date()));
      }

    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`GanttChart: Timeline tasks fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err, "fetching timeline data");
        setError(detailedError);
        toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
        console.warn("GanttChart: Timeline tasks fetch (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err, "fetching timeline data");
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
    const enrichedTasks = allTasks.map(task => {
      const taskStartDateObj = startOfDay(new Date(task.startDate!));
      const taskDueDateObj = startOfDay(new Date(task.dueDate!));
      const isValidationProject = task.task_type === "VALIDATION_PROJECT";
      const isValidationStep = task.task_type === "VALIDATION_STEP";
      
      let parentProjectId: string | undefined = undefined;
      if (isValidationStep && task.dependencies && task.dependencies.length > 0) {
        const parentCandidate = allTasks.find(p => p.id === task.dependencies![0] && p.task_type === "VALIDATION_PROJECT");
        if (parentCandidate) {
          parentProjectId = parentCandidate.id;
        }
      }

      return {
        ...task,
        startDate: taskStartDateObj,
        dueDate: taskDueDateObj,
        progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
        isMilestone: isValidationProject && (task.isMilestone === true ||
                     (task.isMilestone !== false &&
                      isValid(taskStartDateObj) && isValid(taskDueDateObj) &&
                      isSameDay(taskStartDateObj, taskDueDateObj))),
        dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
        isValidationProject,
        isValidationStep,
        parentProjectId,
      };
    });

    let tasksToConsiderForSorting = enrichedTasks;
    if (filterTaskType === "VALIDATION_PROJECT") {
      const projectIdsMaster = enrichedTasks.filter(t => t.isValidationProject).map(t => t.id);
      tasksToConsiderForSorting = enrichedTasks.filter(t => 
        t.isValidationProject || 
        (t.isValidationStep && t.parentProjectId && projectIdsMaster.includes(t.parentProjectId))
      );
    } else if (filterTaskType === "ALL_EXCEPT_VALIDATION") {
      tasksToConsiderForSorting = enrichedTasks.filter(t => !t.isValidationProject && !t.isValidationStep);
    } else if (filterTaskType && filterTaskType !== "VALIDATION_AND_ITS_STEPS") {
      tasksToConsiderForSorting = enrichedTasks.filter(t => t.task_type === filterTaskType);
    }


    const sortedHierarchically: typeof tasksToConsiderForSorting = [];
    const taskPool = new Map(tasksToConsiderForSorting.map(t => [t.id, t]));
    
    const rootLevelTasks = tasksToConsiderForSorting.filter(t => {
      if (t.isValidationProject) return true;
      if (t.isValidationStep) {
        return !(t.parentProjectId && taskPool.has(t.parentProjectId));
      }
      return true; 
    });

    rootLevelTasks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    for (const rootTask of rootLevelTasks) {
      sortedHierarchically.push(rootTask);
      if (rootTask.isValidationProject) {
        const steps = tasksToConsiderForSorting.filter(step => 
            step.isValidationStep && 
            step.parentProjectId === rootTask.id &&
            taskPool.has(step.id) 
        );
        steps.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        sortedHierarchically.push(...steps);
      }
    }
    
    const currentChartStartDate = viewStartDate;
    const currentChartEndDate = endOfMonth(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1));

    const tasksToDisplay = sortedHierarchically.filter(task =>
        (task.startDate <= currentChartEndDate && task.dueDate >= currentChartStartDate)
    );
    
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
  }, [allTasks, viewStartDate, filterTaskType]);


  const { tasksToDisplay, chartStartDate, chartEndDate, totalDaysInView, monthHeaders } = chartData;

  const taskRenderDetailsMap = useMemo(() => {
    const map = new Map<string, {
        task: Task & { startDate: Date; dueDate: Date; isMilestone: boolean; dependencies: string[], isValidationProject?: boolean, isValidationStep?: boolean, parentProjectId?: string };
        index: number;
        barStartX: number;
        barEndX: number;
        barWidth: number;
        barCenterY: number;
        isMilestoneRender: boolean;
        effectiveStartDate: Date;
        effectiveDueDate: Date;
    }>();

    tasksToDisplay.forEach((task, index) => {
        let taskStartActual = task.startDate;
        let taskEndActual = task.dueDate;

        if (dragState && dragState.taskId === task.id) {
            const dragOffsetDays = Math.round(( (dragState.currentMouseX ?? dragState.initialMouseX) - dragState.initialMouseX) / dayCellWidth);

            if (dragState.type === 'drag') {
                taskStartActual = addDays(dragState.originalStartDate, dragOffsetDays);
                taskEndActual = addDays(dragState.originalDueDate, dragOffsetDays);
            } else if (dragState.type === 'resize-start') {
                taskStartActual = addDays(dragState.originalStartDate, dragOffsetDays);
                taskStartActual = min([taskStartActual, addDays(dragState.originalDueDate, - (MIN_TASK_DURATION_DAYS-1) )]);
                taskEndActual = dragState.originalDueDate;
            } else if (dragState.type === 'resize-end') {
                taskStartActual = dragState.originalStartDate;
                taskEndActual = addDays(dragState.originalDueDate, dragOffsetDays);
                taskEndActual = max([taskEndActual, addDays(dragState.originalStartDate, (MIN_TASK_DURATION_DAYS-1) )]);
            }
        }

        const taskStartInView = max([taskStartActual, chartStartDate]);
        const taskEndInView = min([taskEndActual, chartEndDate]);

        const isRenderMilestone = task.isValidationProject && task.isMilestone;

        if (taskStartInView > taskEndInView && !isRenderMilestone) return;

        const taskStartDayOffset = differenceInDays(taskStartInView, chartStartDate);
        const taskDurationInViewDays = isRenderMilestone ? 1 : differenceInDays(taskEndInView, taskStartInView) + 1;

        if (taskDurationInViewDays <= 0 && !isRenderMilestone) return;

        let barLeftPosition = taskStartDayOffset * dayCellWidth;
        const barW = isRenderMilestone ? MILESTONE_SIZE : taskDurationInViewDays * dayCellWidth;

        if (isRenderMilestone) {
            barLeftPosition += (dayCellWidth / 2) - (MILESTONE_SIZE / 2);
        }

        const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING * 2;
        const taskBarTop = TASK_BAR_VERTICAL_PADDING;
        const milestoneTop = (ROW_HEIGHT - MILESTONE_SIZE) / 2;

        map.set(task.id, {
            task,
            index,
            barStartX: barLeftPosition,
            barEndX: barLeftPosition + barW,
            barWidth: barW,
            barCenterY: (index * ROW_HEIGHT) +
                        (isRenderMilestone ? milestoneTop + MILESTONE_SIZE / 2 : taskBarTop + taskBarHeight / 2),
            isMilestoneRender: isRenderMilestone,
            effectiveStartDate: taskStartActual,
            effectiveDueDate: taskEndActual,
        });
    });
    return map;
  }, [tasksToDisplay, chartStartDate, chartEndDate, dayCellWidth, dragState]);

  const dependencyLines = useMemo(() => {
    const lines: { id: string, d: string }[] = [];
    const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING * 2;
    const yBarOffset = taskBarHeight / 4; 

    tasksToDisplay.forEach((dependentTask) => {
        if (!dependentTask.dependencies || dependentTask.dependencies.length === 0) return;
        const dependentDetails = taskRenderDetailsMap.get(dependentTask.id);
        if (!dependentDetails) return;

        dependentTask.dependencies.forEach((predecessorId, depIndex) => {
            const predecessorDetails = taskRenderDetailsMap.get(predecessorId);
            if (!predecessorDetails) return;

            const fromX = predecessorDetails.isMilestoneRender ? predecessorDetails.barStartX + MILESTONE_SIZE / 2 : predecessorDetails.barEndX;
            const toX = dependentDetails.isMilestoneRender ? dependentDetails.barStartX + MILESTONE_SIZE / 2 : dependentDetails.barStartX;
            
            let pathFromY = predecessorDetails.barCenterY;
            if (!predecessorDetails.isMilestoneRender) {
              pathFromY += yBarOffset; 
            }

            let pathToY = dependentDetails.barCenterY;
            if (!dependentDetails.isMilestoneRender) {
              pathToY -= yBarOffset; 
            }
            
            if (!predecessorDetails.isMilestoneRender && 
                !dependentDetails.isMilestoneRender && 
                predecessorDetails.index === dependentDetails.index) { 
                  pathFromY = predecessorDetails.barCenterY + yBarOffset;
                  pathToY = dependentDetails.barCenterY - yBarOffset * 1.5; 
            }
            
            const verticalSegmentX = toX - DEPENDENCY_LINE_OFFSET;
            const pathD = `M ${fromX} ${pathFromY} L ${verticalSegmentX} ${pathFromY} L ${verticalSegmentX} ${pathToY} L ${toX} ${pathToY}`;
            lines.push({ id: `dep-${predecessorId}-to-${dependentTask.id}-${depIndex}`, d: pathD });
        });
    });
    return lines;
  }, [tasksToDisplay, taskRenderDetailsMap]);


    const handleTaskUpdate = useCallback(async (
        taskId: string,
        updates: Partial<Pick<Task, 'startDate' | 'dueDate' | 'dependencies' | 'title' | 'status' | 'progress' | 'instrument_subtype' | 'isMilestone' | 'task_type'>>
    ) => {
        if (!pbClient) return;
        const taskToUpdate = allTasks.find(t => t.id === taskId);
        if (!taskToUpdate) return;

        const payload: Partial<Task> = { ...updates };
        if (updates.startDate) payload.startDate = new Date(updates.startDate).toISOString();
        if (updates.dueDate) payload.dueDate = new Date(updates.dueDate).toISOString();


        if (taskToUpdate.task_type === "VALIDATION_PROJECT") {
            if (updates.hasOwnProperty('isMilestone')) {
                payload.isMilestone = !!updates.isMilestone;
                if (payload.isMilestone && payload.startDate && !payload.dueDate) {
                    payload.dueDate = payload.startDate; 
                }
            }
        } else { 
            payload.isMilestone = false; 
            if (!updates.hasOwnProperty('dependencies')) { 
                delete payload.dependencies;
            } else if (updates.dependencies === null || updates.dependencies === undefined) {
                payload.dependencies = [];
            }
        }


        try {
            await updateTaskService(pbClient, taskId, payload);
            toast({ title: "Task Updated", description: `Task "${updates.title || taskToUpdate.title}" was successfully updated.` });
            if (pbClient) fetchTimelineTasks(pbClient); 
        } catch (err) {
            toast({ title: "Update Failed", description: getDetailedErrorMessage(err, `updating task "${updates.title || taskToUpdate.title}"`), variant: "destructive" });
            if (pbClient) fetchTimelineTasks(pbClient); 
        }
    }, [pbClient, allTasks, toast, fetchTimelineTasks]);


    const handleMouseDownOnTaskBar = useCallback((e: React.MouseEvent, task: Task) => {
        if (e.button !== 0) return; 

        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails) return;

        e.preventDefault();
        e.stopPropagation();

        setDragState({
            type: 'drag',
            taskId: task.id,
            initialMouseX: e.clientX,
            originalStartDate: taskDetails.effectiveStartDate, 
            originalDueDate: taskDetails.effectiveDueDate,
        });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; 
    }, [taskRenderDetailsMap]);

    const handleMouseDownOnResizeHandle = useCallback((e: React.MouseEvent, task: Task, handleType: 'start' | 'end') => {
        if (e.button !== 0) return;
        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails) return;

        e.preventDefault();
        e.stopPropagation();

        setDragState({
            type: handleType === 'start' ? 'resize-start' : 'resize-end',
            taskId: task.id,
            initialMouseX: e.clientX,
            originalStartDate: taskDetails.effectiveStartDate,
            originalDueDate: taskDetails.effectiveDueDate,
        });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [taskRenderDetailsMap]);

    const handleMouseDownOnDependencyConnector = useCallback((e: React.MouseEvent, task: Task) => {
        if (e.button !== 0 || task.task_type !== "VALIDATION_PROJECT") return; 
        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails || taskDetails.isMilestoneRender) return; 

        e.preventDefault();
        e.stopPropagation();

        const ganttRect = ganttBodyRef.current?.getBoundingClientRect();
        const timelineScroll = timelineScrollContainerRef.current;
        if (!ganttRect || !timelineScroll) return;

        
        const initialMouseXInGrid = e.clientX - ganttRect.left + timelineScroll.scrollLeft;
        const initialMouseYInGrid = e.clientY - ganttRect.top + timelineScroll.scrollTop - 60; 

        setDependencyDrawState({
            sourceTaskId: task.id,
            sourceTaskBarEndX: taskDetails.barEndX, 
            sourceTaskBarCenterY: taskDetails.barCenterY,
            currentMouseX: initialMouseXInGrid,
            currentMouseY: initialMouseYInGrid,
        });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'crosshair';
    }, [taskRenderDetailsMap]);
    
    const handleConfirmDeleteTask = useCallback(async () => {
        if (!taskToDelete || !pbClient) return;
        try {
            await deleteTaskService(pbClient, taskToDelete.id);
            toast({ title: "Task Deleted", description: `Task "${taskToDelete.title}" has been deleted.` });
            fetchTimelineTasks(pbClient); 
        } catch (err) {
            toast({ title: "Delete Failed", description: getDetailedErrorMessage(err, "deleting task"), variant: "destructive" });
        } finally {
            setIsDeleteDialogOpen(false);
            setTaskToDelete(null);
        }
    }, [taskToDelete, pbClient, toast, fetchTimelineTasks]);


    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
            if (dragState) {
                setDragState(prev => prev ? { ...prev, currentMouseX: e.clientX } : null);
            } else if (dependencyDrawState && ganttBodyRef.current) {
                 const ganttRect = ganttBodyRef.current.getBoundingClientRect();
                 const timelineScroll = timelineScrollContainerRef.current;
                 if (!timelineScroll) return;

                 const currentXInGrid = e.clientX - ganttRect.left + timelineScroll.scrollLeft;
                 const currentYInGrid = e.clientY - ganttRect.top + timelineScroll.scrollTop - 60; 
                 setDependencyDrawState(prev => prev ? { ...prev, currentMouseX: currentXInGrid, currentMouseY: currentYInGrid } : null);
            }
        };

        const handleWindowMouseUp = (e: MouseEvent) => {
            if (dragState) {
                const taskDetails = taskRenderDetailsMap.get(dragState.taskId);
                if (taskDetails) {
                    handleTaskUpdate(dragState.taskId, {
                        startDate: taskDetails.effectiveStartDate,
                        dueDate: taskDetails.effectiveDueDate,
                    });
                }
                setDragState(null);
                if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'default';
                document.body.style.userSelect = ''; 
            } else if (dependencyDrawState) {
                const ganttRect = ganttBodyRef.current?.getBoundingClientRect();
                const timelineScroll = timelineScrollContainerRef.current;

                if (ganttRect && timelineScroll) {
                    const releaseXInGrid = e.clientX - ganttRect.left + timelineScroll.scrollLeft;
                    const releaseYInGrid = e.clientY - ganttRect.top + timelineScroll.scrollTop - 60;

                    let targetDropTaskId: string | null = null;
                    
                    for (const [taskId, details] of taskRenderDetailsMap.entries()) {
                        if (taskId === dependencyDrawState.sourceTaskId || details.task.task_type !== "VALIDATION_PROJECT") continue; 

                        
                        const taskRowTop = details.index * ROW_HEIGHT;
                        const taskRowBottom = taskRowTop + ROW_HEIGHT;
                        
                        if (releaseYInGrid >= taskRowTop && releaseYInGrid <= taskRowBottom &&
                            releaseXInGrid >= details.barStartX - dayCellWidth/2 && releaseXInGrid <= details.barStartX + dayCellWidth/2) { 
                             targetDropTaskId = taskId;
                             break;
                        }
                    }

                    if (targetDropTaskId) {
                        const sourceTask = allTasks.find(t => t.id === dependencyDrawState.sourceTaskId);
                        const targetTask = allTasks.find(t => t.id === targetDropTaskId);
                        
                        if (sourceTask && targetTask && sourceTask.task_type === "VALIDATION_PROJECT" && targetTask.task_type === "VALIDATION_PROJECT") {
                            const currentTargetDeps = targetTask.dependencies || [];
                            const currentSourceDeps = sourceTask.dependencies || []; 

                            
                            if (!currentTargetDeps.includes(sourceTask.id) && !currentSourceDeps.includes(targetTask.id)) {
                                handleTaskUpdate(targetTask.id, { dependencies: [...currentTargetDeps, sourceTask.id] });
                            } else {
                                toast({ title: "Invalid Dependency", description: "Cannot create duplicate or circular dependency.", variant: "destructive"});
                            }
                        }
                    }
                }
                setDependencyDrawState(null);
                if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'default';
            }
        };

        if (dragState || dependencyDrawState) {
            window.addEventListener('mousemove', handleWindowMouseMove);
            window.addEventListener('mouseup', handleWindowMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [dragState, dependencyDrawState, dayCellWidth, taskRenderDetailsMap, handleTaskUpdate, allTasks, toast]);

  const handlePopoverOpenChange = (isOpen: boolean, task: Task) => {
    setIsQuickEditPopoverOpen(isOpen);
    if (isOpen) {
      setQuickEditTask(task);
    } else {
      setQuickEditTask(null);
    }
  };

  const handlePrevMonth = () => setViewStartDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setViewStartDate(prev => addMonths(prev, 1));
  const handleZoomIn = () => setDayCellWidth(prev => Math.min(MAX_DAY_CELL_WIDTH, prev + 5));
  const handleZoomOut = () => setDayCellWidth(prev => Math.max(MIN_DAY_CELL_WIDTH, prev - 5));
  const refetchTasks = () => pbClient && fetchTimelineTasks(pbClient);

  useEffect(() => {
    let primaryScroller: 'left' | 'right' | null = null;

    const handleLeftScroll = () => {
      if (primaryScroller === 'right') return;
      primaryScroller = 'left';
      if (leftPanelScrollContainerRef.current && timelineScrollContainerRef.current) {
        const rightInnerScroll = timelineScrollContainerRef.current.querySelector('.timeline-inner-content-scrollable-body');
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
        const rightInnerScroll = timelineScrollContainerRef.current.querySelector('.timeline-inner-content-scrollable-body');
        if (rightInnerScroll) {
          leftPanelScrollContainerRef.current.scrollTop = rightInnerScroll.scrollTop;
        }
      }
       requestAnimationFrame(() => primaryScroller = null);
    };

    const leftEl = leftPanelScrollContainerRef.current;
    const rightInnerEl = timelineScrollContainerRef.current?.querySelector('.timeline-inner-content-scrollable-body');

    leftEl?.addEventListener('scroll', handleLeftScroll);
    rightInnerEl?.addEventListener('scroll', handleRightScroll);

    return () => {
      leftEl?.removeEventListener('scroll', handleLeftScroll);
      rightInnerEl?.removeEventListener('scroll', handleRightScroll);
    };
  }, [tasksToDisplay]); 


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
        <p className="text-muted-foreground">
          {filterTaskType === "VALIDATION_PROJECT" ? `No Validation Projects or their steps found for current view.` :
           filterTaskType === "ALL_EXCEPT_VALIDATION" ? `No standard tasks found for current view.` :
           "No tasks found for current view."}
        </p>
        <p className="text-xs mt-1 text-muted-foreground">
            {allTasks.length === 0 ? "Ensure tasks have valid start/due dates." : "Try adjusting date range or zoom."}
        </p>
    </div>
  );

  return (
    <TooltipProvider>
    <div ref={ganttBodyRef} className="gantt-chart-root flex flex-col h-[calc(100vh-200px)] overflow-hidden">
      <div className="flex justify-between items-center p-2 border-b border-border bg-card flex-shrink-0">
        {displayHeaderControls === 'addValidationButton' ? (
            <Link href="/tasks/new?defaultType=VALIDATION_PROJECT" passHref>
              <ShadcnButton variant="outline" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Validation Project
              </ShadcnButton>
            </Link>
          ) : (
            <h2 className="text-lg font-semibold text-card-foreground">Project Timeline</h2>
          )}
         <div className="flex items-center gap-2">
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomOut} disabled={dayCellWidth <= MIN_DAY_CELL_WIDTH} title="Zoom Out"><ZoomOut className="h-4 w-4" /></ShadcnButton>
            <ShadcnButton variant="outline" size="icon" onClick={handleZoomIn} disabled={dayCellWidth >= MAX_DAY_CELL_WIDTH} title="Zoom In"><ZoomIn className="h-4 w-4" /></ShadcnButton>
            <ShadcnButton variant="outline" size="sm" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4 mr-1" />Prev</ShadcnButton>
            <span className="font-medium text-sm text-muted-foreground tabular-nums">{format(viewStartDate, "MMM yyyy")} - {format(addMonths(viewStartDate, GANTT_VIEW_MONTHS - 1), "MMM yyyy")}</span>
            <ShadcnButton variant="outline" size="sm" onClick={handleNextMonth}>Next<ChevronRight className="h-4 w-4 ml-1" /></ShadcnButton>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
            style={{ width: `${LEFT_PANEL_WIDTH}px` }}
            className="flex-shrink-0 bg-card border-r border-border flex flex-col"
        >
          <div className="h-[60px] flex items-center p-2 font-semibold text-xs border-b border-border flex-shrink-0 sticky top-0 bg-card z-20">
            <div className="grid grid-cols-[40px_1fr_70px_70px_60px_60px] w-full items-center gap-2">
                <span className="text-center text-muted-foreground uppercase">WBS</span>
                <span className="text-muted-foreground uppercase">Task Name</span>
                <span className="text-center text-muted-foreground uppercase">Start</span>
                <span className="text-center text-muted-foreground uppercase">End</span>
                <span className="text-center text-muted-foreground uppercase">Prog.</span>
                <span className="text-center text-muted-foreground uppercase">Actions</span> 
            </div>
          </div>
          <div ref={leftPanelScrollContainerRef} className="overflow-y-auto flex-1">
            {tasksToDisplay.length === 0 && !isLoading && renderNoTasksMessage()}
            {tasksToDisplay.map((task, taskIndex) => {
              const isStep = task.isValidationStep && task.parentProjectId && tasksToDisplay.some(t => t.id === task.parentProjectId);
              const canQuickEdit = task.isValidationProject || task.isValidationStep;
             
              const TaskTitleDisplay = (
                <span
                    className={cn(
                        "font-medium truncate",
                        isStep ? "pl-4" : "",
                        canQuickEdit ? "cursor-pointer hover:underline" : ""
                    )}
                    title={task.title}
                    >
                    {isStep && <CornerDownRight className="inline-block h-3 w-3 mr-1 text-muted-foreground" />}
                    {task.title}
                </span>
              );

              return (
                <div
                  key={`${task.id}-leftpanel`}
                  className={cn(
                    "grid grid-cols-[40px_1fr_70px_70px_60px_60px] items-center gap-2 p-2 border-b border-border text-xs transition-opacity duration-150",
                     !canQuickEdit && "cursor-default",
                    task.id === hoveredTaskId ? 'bg-primary/10 dark:bg-primary/20' : '',
                    (dragState && dragState.taskId !== task.id && dragState.type !== 'draw-dependency') ||
                    (dependencyDrawState && dependencyDrawState.sourceTaskId !== task.id) ||
                    (hoveredTaskId && task.id !== hoveredTaskId) ? 'opacity-60' : 'opacity-100'
                  )}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                >
                  <span className="text-center text-muted-foreground">{taskIndex + 1}</span>
                  
                  {canQuickEdit ? (
                    <Popover open={isQuickEditPopoverOpen && quickEditTask?.id === task.id} onOpenChange={(isOpen) => handlePopoverOpenChange(isOpen, task)}>
                        <PopoverTrigger asChild>{TaskTitleDisplay}</PopoverTrigger>
                        <PopoverContent className="w-96 p-4" side="bottom" align="start">
                           {quickEditTask && <QuickEditForm task={quickEditTask} onSave={handleTaskUpdate} onClose={() => setIsQuickEditPopoverOpen(false)} />}
                        </PopoverContent>
                    </Popover>
                  ) : (
                    TaskTitleDisplay
                  )}

                  <span className="text-center text-[10px]">{format(task.startDate, 'ddMMMyy')}</span>
                  <span className="text-center text-[10px]">{format(task.dueDate, 'ddMMMyy')}</span>
                  <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
                  <div className="flex justify-center items-center gap-1 w-full h-full">
                      <div className="w-6 h-6 flex items-center justify-center">
                        {task.isValidationProject && (
                          <ShadcnButton
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title={`Add New Step Task for ${task.title}`}
                            onClick={(e) => {
                              e.stopPropagation(); 
                              const queryParams = new URLSearchParams();
                              queryParams.set('defaultType', 'VALIDATION_STEP');
                              queryParams.set('dependsOnValidationProject', task.id);
                              queryParams.set('defaultTitle', `Step for: ${task.title}`);
                              router.push(`/tasks/new?${queryParams.toString()}`);
                            }}
                          >
                            <PlusCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </ShadcnButton>
                        )}
                      </div>
                      <div className="w-6 h-6 flex items-center justify-center"> 
                        {(task.isValidationProject || task.isValidationStep) && (
                          <ShadcnButton
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title={`Delete Task: ${task.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskToDelete(task);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive/70 hover:text-destructive" />
                          </ShadcnButton>
                        )}
                      </div>
                    </div>
                </div>
            )})}
          </div>
        </div>

        <div className="flex-1 overflow-auto" ref={timelineScrollContainerRef}>
           <div className="relative timeline-inner-content">
            <div className="sticky top-0 z-20 bg-card">
              <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: monthHeaders.map(m => `${m.span * dayCellWidth}px`).join(' ') || '1fr' }}>
                {monthHeaders.map((month, index) => (
                  <div key={index} className="flex items-center justify-center border-r border-border font-semibold text-xs">{month.name}</div>
                ))}
                 {monthHeaders.length === 0 && <div className="h-full col-span-1"></div>}
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
            <div className="relative timeline-inner-content-scrollable-body" style={{height: `${timelineGridHeight}px`, width: `${timelineGridWidth}px`}}>
            {tasksToDisplay.length > 0 && (
              <>
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
                  const { barStartX, barWidth, isMilestoneRender } = taskDetails;

                  const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING * 2;
                  const taskBarTopOffset = TASK_BAR_VERTICAL_PADDING;
                  const milestoneTopOffset = (ROW_HEIGHT - MILESTONE_SIZE) / 2;
                  const isBeingDragged = dragState?.taskId === task.id;
                  const isBeingDepDrawnFrom = dependencyDrawState?.sourceTaskId === task.id;
                  
                  return (
                      <Tooltip key={`${task.id}-timeline`} delayDuration={isBeingDragged || isBeingDepDrawnFrom ? 999999 : 100}>
                        <TooltipTrigger asChild>
                          <div
                            onMouseDown={(e) => handleMouseDownOnTaskBar(e, task)}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className={cn(
                              "absolute transition-opacity duration-150 ease-in-out group z-10 flex items-center justify-center cursor-grab",
                              getTaskBarColor(task.status, isMilestoneRender, task.task_type),
                              !isMilestoneRender && "rounded-sm",
                              (isBeingDragged || isBeingDepDrawnFrom) ? 'ring-2 ring-ring ring-offset-background ring-offset-1 shadow-lg' :
                              (task.id === hoveredTaskId ? 'ring-1 ring-primary/70' : ''),
                              ( (dragState && dragState.taskId !== task.id) ||
                                (dependencyDrawState && dependencyDrawState.sourceTaskId !== task.id) ||
                                (hoveredTaskId && task.id !== hoveredTaskId) ) ? 'opacity-50' : 'opacity-100'
                            )}
                            style={{
                              left: `${barStartX}px`,
                              width: `${barWidth < 0 ? 0 : barWidth}px`,
                              top: `${(taskIndex * ROW_HEIGHT) + (isMilestoneRender ? milestoneTopOffset : taskBarTopOffset)}px`,
                              height: isMilestoneRender ? `${MILESTONE_SIZE}px` : `${taskBarHeight}px`,
                            }}
                          >
                            {!isMilestoneRender && (
                              <>
                              <div
                                  className="resize-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20"
                                  onMouseDown={(e) => handleMouseDownOnResizeHandle(e, task, 'start')}
                                  title="Resize start date"
                              >
                                  <GripVertical className="h-full w-2 text-white/30 hover:text-white/70" />
                              </div>
                              <div
                                  className="resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20"
                                  onMouseDown={(e) => handleMouseDownOnResizeHandle(e, task, 'end')}
                                  title="Resize end date"
                              >
                                  <GripVertical className="h-full w-2 text-white/30 hover:text-white/70" />
                              </div>
                              {task.isValidationProject && ( 
                                <div
                                  className="dependency-connector absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background cursor-crosshair z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onMouseDown={(e) => handleMouseDownOnDependencyConnector(e, task)}
                                  title="Draw dependency"
                                />
                              )}
                              </>
                            )}
                            {!isMilestoneRender && task.status?.toLowerCase() !== 'done' && task.progress !== undefined && task.progress > 0 && barWidth > 0 && (
                              <div className="absolute top-0 left-0 h-full bg-black/40 rounded-sm" style={{ width: `${task.progress}%`}} />
                            )}
                            {isMilestoneRender && ( 
                              <div className="absolute inset-0 flex items-center justify-center">
                                <svg viewBox="0 0 100 100" className="w-full h-full fill-current text-white/80" preserveAspectRatio="none">
                                  <polygon points="50,0 100,50 50,100 0,50" />
                                </svg>
                              </div>
                            )}
                            {!isMilestoneRender && barWidth > (dayCellWidth * 0.75) && ( 
                               <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                                  <span className="text-[10px] text-white/90 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                    {task.title}
                                  </span>
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 shadow-lg bg-popover text-popover-foreground rounded-md border max-w-xs w-auto z-50">
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">
                               {task.title}
                               {task.isValidationProject && task.isMilestone ? " (Milestone)" : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">Type: <span className="font-medium text-foreground">{task.task_type.replace(/_/g, ' ')}</span></p>
                            {(task.task_type === "MDL" || task.task_type === "SOP") && task.instrument_subtype && (
                               <p className="text-xs text-muted-foreground">Subtype: <span className="font-medium text-foreground">{task.instrument_subtype}</span></p>
                            )}
                            <p className="text-xs text-muted-foreground">Status: <span className="font-medium text-foreground">{task.status}</span></p>
                            <p className="text-xs text-muted-foreground">Priority: <span className="font-medium text-foreground">{task.priority}</span></p>
                            <p className="text-xs text-muted-foreground">Progress: <span className="font-medium text-foreground">{task.progress || 0}%</span></p>
                            <p className="text-xs text-muted-foreground">
                              Dates: {format(task.startDate, 'MMM d, yy')} - {format(task.dueDate, 'MMM d, yy')}
                            </p>
                            {task.assignedTo_text && (
                              <p className="text-xs text-muted-foreground">Assigned to: <span className="font-medium text-foreground">{task.assignedTo_text}</span></p>
                            )}
                            {task.dependencies && task.dependencies.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mt-1">Depends on:</p>
                                <ul className="list-disc list-inside pl-2 space-y-0.5">
                                  {task.dependencies.map(depId => {
                                    const depTaskDetails = allTasks.find(t => t.id === depId); 
                                    return <li key={depId} className="text-xs font-medium text-foreground truncate" title={depTaskDetails?.title}>{depTaskDetails?.title || 'Unknown Task'}</li>;
                                  })}
                                </ul>
                              </div>
                            )}
                             {(!task.dependencies || task.dependencies.length === 0) && (
                               <p className="text-xs text-muted-foreground">Dependencies: None</p>
                             )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                  );
                })}

                {dependencyDrawState && (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-40" style={{ width: timelineGridWidth, height: timelineGridHeight }}>
                        <line
                            x1={dependencyDrawState.sourceTaskBarEndX}
                            y1={dependencyDrawState.sourceTaskBarCenterY}
                            x2={dependencyDrawState.currentMouseX}
                            y2={dependencyDrawState.currentMouseY}
                            stroke="hsl(var(--primary))"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                        />
                    </svg>
                )}

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
                        <polygon points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE*0.4}, 0 ${ARROW_SIZE*0.8}`} fill="hsl(var(--foreground) / 0.7)" />
                      </marker>
                    </defs>
                    {dependencyLines.map(line => (
                      <path key={line.id} d={line.d} stroke="hsl(var(--foreground) / 0.7)" strokeWidth="1.2" fill="none" markerEnd="url(#arrowhead)" />
                    ))}
                  </svg>
                )}
              </>
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
    </div>
    {taskToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete the task "{taskToDelete.title}"?
                        {taskToDelete.task_type === "VALIDATION_PROJECT" && " Associated step tasks will NOT be automatically deleted and will need to be managed separately."}
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDeleteTask} className={cn(buttonVariants({variant: "destructive"}))}>
                        Delete Task
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </TooltipProvider>
  );
};

interface QuickEditFormProps {
  task: Task;
  onSave: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onClose: () => void;
}

const QuickEditForm: React.FC<QuickEditFormProps> = ({ task, onSave, onClose }) => {
  const form = useForm<QuickEditFormData>({
    resolver: zodResolver(quickEditFormSchema),
    defaultValues: {
      title: task.title,
      startDate: task.startDate ? new Date(task.startDate) : undefined,
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      isMilestone: task.task_type === "VALIDATION_PROJECT" ? !!task.isMilestone : false,
    },
  });

  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);

  const watchedIsMilestone = form.watch("isMilestone");
  const watchedStartDate = form.watch("startDate");

  useEffect(() => {
    if (task.task_type === "VALIDATION_PROJECT" && watchedIsMilestone && watchedStartDate) {
      if (!form.getValues("dueDate") || form.getValues("dueDate")?.getTime() !== watchedStartDate.getTime()) {
        form.setValue("dueDate", watchedStartDate, { shouldValidate: true });
      }
    }
  }, [watchedIsMilestone, watchedStartDate, task.task_type, form]);


  const onSubmit = async (data: QuickEditFormData) => {
    setIsSubmitting(true);
    const updates: Partial<Task> = {
      title: data.title,
      startDate: data.startDate,
      dueDate: data.dueDate,
    };
    if (task.task_type === "VALIDATION_PROJECT") {
      updates.isMilestone = data.isMilestone;
       if (data.isMilestone && data.startDate) {
         updates.dueDate = data.startDate; // Milestone due date is same as start date
       }
    }
    
    try {
      await onSave(task.id, updates);
      onClose();
    } catch (e) {
      // Error is handled by onSave's caller (handleTaskUpdate)
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h4 className="font-medium text-sm leading-none">Edit: {task.title}</h4>
      <div>
        <Label htmlFor="quickEditTitle">Title</Label>
        <Input id="quickEditTitle" {...form.register("title")} className="mt-1" />
        {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
      </div>

      {task.task_type === "VALIDATION_PROJECT" && (
        <div className="flex items-center space-x-2">
          <Controller
            name="isMilestone"
            control={form.control}
            render={({ field }) => (
              <Checkbox
                id="quickEditIsMilestone"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="quickEditIsMilestone" className="text-sm font-normal">
            Is Milestone
          </Label>
        </div>
      )}

      <div>
        <Label htmlFor="quickEditStartDate">Start Date</Label>
        <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
            <PopoverTrigger asChild>
                <ShadcnButton
                variant={"outline"}
                className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !form.watch("startDate") && "text-muted-foreground"
                )}
                >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.watch("startDate") ? format(form.watch("startDate")!, "PPP") : <span>Pick a date</span>}
                </ShadcnButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                mode="single"
                selected={form.watch("startDate")}
                onSelect={(date) => {
                  form.setValue("startDate", date, { shouldValidate: true });
                  setStartDatePickerOpen(false);
                }}
                initialFocus
                />
            </PopoverContent>
        </Popover>
        {form.formState.errors.startDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.startDate.message}</p>}
      </div>

      {!(task.task_type === "VALIDATION_PROJECT" && watchedIsMilestone) && (
        <div>
          <Label htmlFor="quickEditDueDate">Due Date</Label>
            <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                <PopoverTrigger asChild>
                    <ShadcnButton
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal mt-1",
                        !form.watch("dueDate") && "text-muted-foreground"
                    )}
                    >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("dueDate") ? format(form.watch("dueDate")!, "PPP") : <span>Pick a date</span>}
                    </ShadcnButton>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                    mode="single"
                    selected={form.watch("dueDate")}
                    onSelect={(date) => {
                      form.setValue("dueDate", date, { shouldValidate: true });
                      setDueDatePickerOpen(false);
                    }}
                    disabled={(date) =>
                        form.watch("startDate") ? date < form.watch("startDate")! : false
                    }
                    initialFocus
                    />
                </PopoverContent>
            </Popover>
          {form.formState.errors.dueDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.dueDate.message}</p>}
        </div>
      )}
      {form.formState.errors.root && <p className="text-xs text-destructive mt-1">{form.formState.errors.root.message}</p>}

      <div className="flex justify-end space-x-2 pt-2">
        <ShadcnButton type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
          <XCircle className="mr-2 h-4 w-4" /> Cancel
        </ShadcnButton>
        <ShadcnButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </ShadcnButton>
      </div>
    </form>
  );
};


export default GanttChart;

// cn helper from ShadCN UI
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);





