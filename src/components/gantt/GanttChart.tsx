
"use client";

import type { Task, TaskStatus, TaskType } from '@/lib/types';
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
import { getTasks, updateTask as updateTaskService } from "@/services/taskService"; 
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, GripVertical, Save, Link as LinkIcon, PlusCircle, Trash2, ListPlus } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button"; 
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUSES, TASK_TYPES, INSTRUMENT_SUBTYPES, SOP_SUBTYPES } from "@/lib/constants";
import type PocketBase from "pocketbase";
import Link from "next/link";
import { ScrollArea } from '@/components/ui/scroll-area';

const ROW_HEIGHT = 48; 
const LEFT_PANEL_WIDTH = 450; 
const TASK_BAR_VERTICAL_PADDING = 8; 
const GANTT_VIEW_MONTHS = 3; 
const MILESTONE_SIZE = 16; 

const MIN_DAY_CELL_WIDTH = 15; 
const MAX_DAY_CELL_WIDTH = 60; 
const DEFAULT_DAY_CELL_WIDTH = 30; 

const DEPENDENCY_LINE_OFFSET = 15; 
const ARROW_SIZE = 5; 
const RESIZE_HANDLE_WIDTH = 8; 
const MIN_TASK_DURATION_DAYS = 1;

const getTaskBarColor = (status?: TaskStatus, isMilestone?: boolean, taskType?: TaskType): string => {
  if (taskType === "VALIDATION_PROJECT" && isMilestone) return 'bg-purple-500 hover:bg-purple-600';
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

interface QuickEditPopoverState {
  taskId: string | null;
  currentTitle: string; 
  currentTaskType: TaskType; 
  currentInstrumentSubtype?: string;
  currentStatus: TaskStatus;
  currentProgress: number;
  currentSteps: string[];
  newStepText: string;
}

interface GanttChartProps {
  filterTaskType?: TaskType; 
  displayHeaderControls?: 'defaultTitle' | 'addValidationButton';
}

const GanttChart: React.FC<GanttChartProps> = ({ filterTaskType, displayHeaderControls = 'defaultTitle' }) => {
  const { pbClient } = useAuth();
  const { toast } = useToast();
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

  const [quickEditPopoverState, setQuickEditPopoverState] = useState<QuickEditPopoverState>({
    taskId: null,
    currentTitle: "",
    currentTaskType: TASK_TYPES.find(t => t !== "VALIDATION_PROJECT") || TASK_TYPES[0], // Default to a non-validation type initially
    currentInstrumentSubtype: undefined,
    currentStatus: 'To Do',
    currentProgress: 0,
    currentSteps: [],
    newStepText: "",
  });
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
      if (filterTaskType) {
        fetchOptions.filter = `task_type = "${filterTaskType}"`;
      } else {
        
        fetchOptions.filter = `task_type != "VALIDATION_PROJECT"`;
      }


      const fetchedTasks = await getTasks(pb, fetchOptions);
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
  }, [toast, filterTaskType]);

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
        isMilestone: task.task_type === "VALIDATION_PROJECT" && (task.isMilestone === true ||
                     (task.isMilestone !== false &&
                      isValid(taskStartDateObj) && isValid(taskDueDateObj) &&
                      isSameDay(taskStartDateObj, taskDueDateObj))),
        dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
        steps: Array.isArray(task.steps) ? task.steps : [],
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
        task: Task & { startDate: Date; dueDate: Date; isMilestone: boolean; dependencies: string[]; steps: string[] };
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
        
        const isRenderMilestone = task.task_type === "VALIDATION_PROJECT" && task.isMilestone;

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
    tasksToDisplay.forEach((dependentTask) => {
        if (dependentTask.task_type !== "VALIDATION_PROJECT" || !dependentTask.dependencies || dependentTask.dependencies.length === 0) return;
        const dependentDetails = taskRenderDetailsMap.get(dependentTask.id);
        if (!dependentDetails) return;

        dependentTask.dependencies.forEach((predecessorId, depIndex) => {
            const predecessorDetails = taskRenderDetailsMap.get(predecessorId);
            if (!predecessorDetails || predecessorDetails.task.task_type !== "VALIDATION_PROJECT") return; 
            
            const fromX = predecessorDetails.isMilestoneRender ? predecessorDetails.barStartX + MILESTONE_SIZE / 2 : predecessorDetails.barEndX;
            const fromY = predecessorDetails.barCenterY;
            const toX = dependentDetails.isMilestoneRender ? dependentDetails.barStartX + MILESTONE_SIZE / 2 : dependentDetails.barStartX;
            const toY = dependentDetails.barCenterY;

            if (fromX >= toX && fromY === toY) return;

            const turnX = fromX + DEPENDENCY_LINE_OFFSET;
            const pathD = `M ${fromX} ${fromY} L ${turnX} ${fromY} L ${turnX} ${toY} L ${toX} ${toY}`;
            lines.push({ id: `dep-${predecessorId}-to-${dependentTask.id}-${depIndex}`, d: pathD });
        });
    });
    return lines;
  }, [tasksToDisplay, taskRenderDetailsMap]);

    const handleTaskUpdate = useCallback(async (
        taskId: string, 
        updates: Partial<Pick<Task, 'startDate' | 'dueDate' | 'dependencies' | 'title' | 'status' | 'progress' | 'instrument_subtype' | 'isMilestone' | 'task_type' | 'steps'>>
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
            }
            if (updates.steps) {
                payload.steps = Array.isArray(updates.steps) ? updates.steps : [];
            }
        } else { 
            payload.isMilestone = false;
            payload.dependencies = [];
            payload.steps = [];
        }

        try {
            await updateTaskService(pbClient, taskId, payload);
            toast({ title: "Task Updated", description: `Task "${taskToUpdate.title}" was successfully updated.` });
            fetchTimelineTasks(pbClient); 
        } catch (err) {
            toast({ title: "Update Failed", description: getDetailedErrorMessage(err, `updating task "${taskToUpdate.title}"`), variant: "destructive" });
            fetchTimelineTasks(pbClient);
        }
    }, [pbClient, allTasks, toast, fetchTimelineTasks]);


    const handleMouseDownOnTaskBar = (e: React.MouseEvent, task: Task) => {
        if (e.button !== 0) return; 
        if (isQuickEditPopoverOpen && quickEditPopoverState.taskId === task.id) return; 

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
    };
    
    const handleMouseDownOnResizeHandle = (e: React.MouseEvent, task: Task, handleType: 'start' | 'end') => {
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
    };

    const handleMouseDownOnDependencyConnector = (e: React.MouseEvent, task: Task) => {
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
    };

    const openQuickEditPopover = useCallback((task: Task) => {
      setQuickEditPopoverState({
        taskId: task.id,
        currentTitle: task.title,
        currentTaskType: task.task_type,
        currentInstrumentSubtype: task.instrument_subtype,
        currentStatus: task.status,
        currentProgress: task.progress || 0,
        currentSteps: task.task_type === "VALIDATION_PROJECT" ? ((task as any).steps || []) : [],
        newStepText: "",
      });
      setIsQuickEditPopoverOpen(true);
    }, []);
    
    const handleTaskBarClick = useCallback((e: React.MouseEvent, task: Task) => {
        if (e.detail !== 1 || Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2) { 
          return;
        }
        const targetElement = e.target as HTMLElement;
        if (targetElement.classList.contains('resize-handle') || 
            targetElement.classList.contains('dependency-connector') || 
            targetElement.closest('.dependency-connector')) {
          return;
        }
        openQuickEditPopover(task);
      }, [openQuickEditPopover]);
    
    const handleLeftPanelItemClick = useCallback((e: React.MouseEvent, task: Task) => {
      if (task.task_type === "VALIDATION_PROJECT") {
        e.stopPropagation();
        openQuickEditPopover(task);
      }
    }, [openQuickEditPopover]);
    
    const handleAddStepInQuickEdit = useCallback(() => {
        if (quickEditPopoverState.newStepText.trim() === "") return;
        setQuickEditPopoverState(prev => ({
            ...prev,
            currentSteps: [...prev.currentSteps, prev.newStepText.trim()],
            newStepText: ""
        }));
    }, [quickEditPopoverState.newStepText]);

    const handleDeleteStepInQuickEdit = useCallback((indexToDelete: number) => {
        setQuickEditPopoverState(prev => ({
            ...prev,
            currentSteps: prev.currentSteps.filter((_, index) => index !== indexToDelete)
        }));
    }, []);


    const handleSaveQuickEdit = useCallback(() => {
        if (!quickEditPopoverState.taskId) return;
        
        const updates: Partial<Pick<Task, 'title' | 'status' | 'progress' | 'instrument_subtype' | 'task_type' | 'steps'>> = {
            title: quickEditPopoverState.currentTitle,
            status: quickEditPopoverState.currentStatus,
            progress: quickEditPopoverState.currentProgress,
        };

        if (quickEditPopoverState.currentTaskType === "MDL" || quickEditPopoverState.currentTaskType === "SOP") {
            updates.instrument_subtype = quickEditPopoverState.currentInstrumentSubtype;
        } else {
            updates.instrument_subtype = undefined;
        }

        if (quickEditPopoverState.currentTaskType === "VALIDATION_PROJECT") {
            updates.steps = quickEditPopoverState.currentSteps;
        } else {
            updates.steps = []; 
        }
        
        handleTaskUpdate(quickEditPopoverState.taskId, updates);
        setIsQuickEditPopoverOpen(false);
        setQuickEditPopoverState({taskId: null, currentTitle: "", currentTaskType: TASK_TYPES.find(t => t !== "VALIDATION_PROJECT") || TASK_TYPES[0], currentInstrumentSubtype: undefined, currentStatus: 'To Do', currentProgress: 0, currentSteps: [], newStepText: ""});
    }, [quickEditPopoverState, handleTaskUpdate]);


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
                            releaseXInGrid >= details.barStartX - dayCellWidth / 2 && releaseXInGrid <= details.barStartX + dayCellWidth / 2) {
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
          {filterTaskType ? `No ${filterTaskType.replace(/_/g, ' ')} tasks found for current view.` : "No tasks found for current view."}
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
                className={cn(
                  "grid grid-cols-[40px_1fr_70px_70px_60px] items-center gap-2 p-2 border-b border-border text-xs transition-opacity duration-150",
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
                <span 
                  className={cn(
                    "font-medium truncate",
                    task.task_type === "VALIDATION_PROJECT" ? "cursor-pointer hover:text-primary" : "cursor-default"
                  )}
                  title={task.title} 
                  onClick={(e) => handleLeftPanelItemClick(e, task)}
                >
                   {task.title}
                </span>
                <span className="text-center text-[10px]">{format(task.startDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px]">{format(task.dueDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
              </div>
            ))}
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
                    <Popover key={`${task.id}-popover`} open={isQuickEditPopoverOpen && quickEditPopoverState.taskId === task.id} onOpenChange={(open) => {
                      if (!open) {
                        setIsQuickEditPopoverOpen(false);
                        setQuickEditPopoverState({taskId: null, currentTitle: "", currentTaskType: TASK_TYPES.find(t => t !== "VALIDATION_PROJECT") || TASK_TYPES[0], currentInstrumentSubtype: undefined, currentStatus: 'To Do', currentProgress: 0, currentSteps: [], newStepText: ""});
                      } else if (task.id !== quickEditPopoverState.taskId) { 
                         openQuickEditPopover(task);
                      }
                    }}>
                    <Tooltip delayDuration={isBeingDragged || isBeingDepDrawnFrom || (isQuickEditPopoverOpen && quickEditPopoverState.taskId === task.id) ? 999999 : 100}>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                        <div
                          onMouseDown={(e) => handleMouseDownOnTaskBar(e, task)}
                          onClick={(e) => handleTaskBarClick(e, task)}
                          onMouseEnter={() => setHoveredTaskId(task.id)}
                          onMouseLeave={() => setHoveredTaskId(null)}
                          className={cn(
                            "absolute transition-opacity duration-150 ease-in-out group cursor-grab z-10 flex items-center justify-center", 
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
                            {task.task_type === "VALIDATION_PROJECT" && (
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
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent className="p-2 shadow-lg bg-popover text-popover-foreground rounded-md border max-w-xs w-auto z-50">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">
                             {task.title}
                             {task.task_type === "VALIDATION_PROJECT" && task.isMilestone ? " (Milestone)" : ""}
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
                          {task.task_type === "VALIDATION_PROJECT" && task.dependencies && task.dependencies.length > 0 && (
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
                           {task.task_type === "VALIDATION_PROJECT" && (!task.dependencies || task.dependencies.length === 0) && (
                             <p className="text-xs text-muted-foreground">Dependencies: None</p>
                           )}
                           {task.task_type === "VALIDATION_PROJECT" && task.steps && task.steps.length > 0 && (
                                <div>
                                <p className="text-xs text-muted-foreground mt-1">Steps:</p>
                                <ScrollArea className="max-h-20">
                                  <ul className="list-decimal list-inside pl-2 space-y-0.5">
                                      {task.steps.map((step, idx) => (
                                      <li key={idx} className="text-xs font-medium text-foreground truncate" title={step}>{step}</li>
                                      ))}
                                  </ul>
                                </ScrollArea>
                                </div>
                            )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-96 z-50" side="bottom" align="start">
                        <div className="grid gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Quick Edit: {quickEditPopoverState.currentTitle}</h4>
                            <p className="text-sm text-muted-foreground">
                            Modify task details.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor={`qe-title-${task.id}`}>Name</Label>
                                <Input 
                                  id={`qe-title-${task.id}`} 
                                  value={quickEditPopoverState.currentTitle}
                                  onChange={(e) => setQuickEditPopoverState(prev => ({...prev, currentTitle: e.target.value}))}
                                  className="col-span-2 h-8"
                                />
                            </div>
                            {quickEditPopoverState.currentTaskType !== "VALIDATION_PROJECT" && (quickEditPopoverState.currentTaskType === "MDL" || quickEditPopoverState.currentTaskType === "SOP") && (
                                <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor={`qe-instrument-${task.id}`}>Subtype</Label>
                                <Select
                                    value={quickEditPopoverState.currentInstrumentSubtype || ""}
                                    onValueChange={(value) => setQuickEditPopoverState(prev => ({...prev, currentInstrumentSubtype: value}))}
                                >
                                    <SelectTrigger id={`qe-instrument-${task.id}`} className="col-span-2 h-8">
                                        <SelectValue placeholder="Select subtype" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(quickEditPopoverState.currentTaskType === "MDL" ? INSTRUMENT_SUBTYPES : SOP_SUBTYPES).map(subtype => (
                                            <SelectItem key={subtype} value={subtype}>{subtype}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                </div>
                            )}
                            <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor={`qe-status-${task.id}`}>Status</Label>
                            <Select 
                                value={quickEditPopoverState.currentStatus} 
                                onValueChange={(value: TaskStatus) => setQuickEditPopoverState(prev => ({...prev, currentStatus: value}))}
                            >
                                <SelectTrigger id={`qe-status-${task.id}`} className="col-span-2 h-8">
                                <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                {TASK_STATUSES.map(status => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            </div>
                            <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor={`qe-progress-${task.id}`}>Progress (%)</Label>
                            <Input
                                id={`qe-progress-${task.id}`}
                                type="number"
                                min="0"
                                max="100"
                                value={quickEditPopoverState.currentProgress}
                                onChange={(e) => setQuickEditPopoverState(prev => ({...prev, currentProgress: parseInt(e.target.value, 10) || 0}))}
                                className="col-span-2 h-8"
                            />
                            </div>
                            {quickEditPopoverState.currentTaskType === "VALIDATION_PROJECT" && (
                              <div className="space-y-2">
                                <Label>Steps</Label>
                                {quickEditPopoverState.currentSteps.length > 0 && (
                                  <ScrollArea className="h-24 rounded-md border p-2">
                                    {quickEditPopoverState.currentSteps.map((step, index) => (
                                      <div key={index} className="flex items-center justify-between gap-2 py-1">
                                        <span className="text-sm flex-1 truncate" title={step}>{index+1}. {step}</span>
                                        <ShadcnButton 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6 shrink-0"
                                          onClick={() => handleDeleteStepInQuickEdit(index)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </ShadcnButton>
                                      </div>
                                    ))}
                                  </ScrollArea>
                                )}
                                <div className="flex items-center gap-2">
                                  <Input 
                                    placeholder="New step description" 
                                    value={quickEditPopoverState.newStepText}
                                    onChange={(e) => setQuickEditPopoverState(prev => ({...prev, newStepText: e.target.value}))}
                                    className="h-8 flex-1"
                                  />
                                  <ShadcnButton type="button" size="sm" onClick={handleAddStepInQuickEdit} className="h-8">
                                    <ListPlus className="mr-1 h-4 w-4" /> Add
                                  </ShadcnButton>
                                </div>
                              </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <ShadcnButton variant="ghost" size="sm" onClick={() => setIsQuickEditPopoverOpen(false)}>Cancel</ShadcnButton>
                            <ShadcnButton size="sm" onClick={handleSaveQuickEdit}><Save className="mr-1 h-4 w-4" />Save</ShadcnButton>
                        </div>
                        </div>
                    </PopoverContent>
                  </Popover>
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
                        <polygon points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE*0.4}, 0 ${ARROW_SIZE*0.8}`} fill="hsl(var(--foreground) / 0.6)" />
                      </marker>
                    </defs>
                    {dependencyLines.map(line => (
                      <path key={line.id} d={line.d} stroke="hsl(var(--foreground) / 0.6)" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)" />
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
    </TooltipProvider>
  );
};

export default GanttChart;


