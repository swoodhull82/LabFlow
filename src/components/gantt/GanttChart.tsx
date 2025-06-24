
"use client";

import type { Task, Employee, TaskType } from '@/lib/types';
import { addDays, differenceInDays, format, startOfDay, isSameDay, isWithinInterval, max, min, isValid, addMonths, subMonths, startOfMonth, endOfMonth, addYears, isBefore, getISOWeek, eachDayOfInterval, startOfQuarter, endOfQuarter, addQuarters, subQuarters, eachWeekOfInterval, eachMonthOfInterval, subYears, addQuarters as addQuartersDateFns, endOfYear, startOfYear } from 'date-fns';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/AuthContext";
import { getTasks, updateTask as updateTaskService, deleteTask as deleteTaskService } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ChevronLeft, ChevronRight, PlusCircle, Trash2, Save, CalendarIcon, XCircle, MoreHorizontal, ChevronDown, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cva } from 'class-variance-authority';


const ROW_HEIGHT = 40;
const LEFT_PANEL_WIDTH = 450;
const TASK_BAR_VERTICAL_PADDING = 6;
const MILESTONE_SIZE = 14;
const DEPENDENCY_LINE_OFFSET = 12;
const ARROW_SIZE = 4;
const MIN_TASK_DURATION_DAYS = 1;

const PROJECT_COLORS = [
  { base: 'bg-blue-500', hover: 'hover:bg-blue-600', progress: 'bg-blue-700' },
  { base: 'bg-teal-500', hover: 'hover:bg-teal-600', progress: 'bg-teal-700' },
  { base: 'bg-rose-500', hover: 'hover:bg-rose-600', progress: 'bg-rose-700' },
  { base: 'bg-amber-500', hover: 'hover:bg-amber-600', progress: 'bg-amber-700' },
  { base: 'bg-cyan-500', hover: 'hover:bg-cyan-600', progress: 'bg-cyan-700' },
  { base: 'bg-lime-500', hover: 'hover:bg-lime-600', progress: 'bg-lime-700' },
];
const DEFAULT_TASK_COLOR = { base: 'bg-gray-400', hover: 'hover:bg-gray-500', progress: 'bg-gray-600' };
const MILESTONE_COLORS = {
  VALIDATION_PROJECT: { base: 'bg-purple-500', hover: 'hover:bg-purple-600' },
  VALIDATION_STEP: { base: 'bg-indigo-500', hover: 'hover:bg-indigo-600' },
  DEFAULT: { base: 'bg-amber-500', hover: 'hover:bg-amber-600' },
};


const getInitials = (name: string = ""): string => {
    return name
        .split(' ')
        .map(n => n[0])
        .filter((_, i, arr) => i === 0 || i === arr.length - 1)
        .join('')
        .toUpperCase();
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

type TimeScaleView = 'day' | 'week' | 'month' | 'quarter';

interface GanttChartProps {
  filterTaskType?: TaskType | "ALL_EXCEPT_VALIDATION" | "VALIDATION_PROJECT";
  displayHeaderControls?: 'defaultTitle' | 'addValidationButton';
}

const quickEditFormSchema = z.object({
  title: z.string().min(1, "Title is required."),
  startDate: z.date().optional(),
  dueDate: z.date().optional(),
  isMilestone: z.boolean().optional(),
}).refine(data => {
    if (data.isMilestone === true) {
      if (!data.startDate) return false;
      if (data.dueDate && data.startDate.getTime() !== data.dueDate.getTime()) return false;
    } else {
      if (data.startDate && data.dueDate && data.startDate > data.dueDate) return false;
    }
    return true;
}, {
    message: "Date configuration invalid. Milestones require a single date (set via Start Date). For ranges, start date must be before or same as due date.",
    path: ["startDate"],
});
type QuickEditFormData = z.infer<typeof quickEditFormSchema>;


const GanttChart: React.FC<GanttChartProps> = ({ filterTaskType = "ALL_EXCEPT_VALIDATION", displayHeaderControls = 'defaultTitle' }) => {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date>(startOfMonth(new Date()));
  const [timeScaleView, setTimeScaleView] = useState<TimeScaleView>('week');
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dependencyDrawState, setDependencyDrawState] = useState<DependencyDrawState | null>(null);
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  const timelineScrollContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelScrollContainerRef = useRef<HTMLDivElement>(null);
  const ganttBodyRef = useRef<HTMLDivElement>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const [quickEditTask, setQuickEditTask] = useState<Task | null>(null);
  const [isQuickEditPopoverOpen, setIsQuickEditPopoverOpen] = useState(false);


  const fetchTimelineData = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const projectionHorizon = addYears(new Date(), 5);
      const taskFetchOptions: any = { signal, projectionHorizon };
      const employeeFetchOptions: any = { signal };

      const [fetchedTasks, fetchedEmployees] = await Promise.all([
        getTasks(pb, taskFetchOptions),
        getEmployees(pb, employeeFetchOptions)
      ]);

      const validRawTasks = fetchedTasks.filter(task =>
        task.startDate && task.dueDate &&
        isValid(new Date(task.startDate)) && isValid(new Date(task.dueDate))
      );
      setAllTasks(validRawTasks);
      setEmployees(fetchedEmployees);

      if (validRawTasks.length > 0) {
         const firstDate = min(validRawTasks.map(t => new Date(t.startDate!)));
         setViewStartDate(startOfMonth(firstDate));
      } else {
        setViewStartDate(startOfMonth(new Date()));
      }

    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (isAutocancel) {
        console.warn(`GanttChart: Timeline data fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else {
        const detailedError = getDetailedErrorMessage(err, "fetching timeline data");
        setError(detailedError);
        toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
        console.warn("GanttChart: Error fetching data for timeline (after retries):", detailedError, err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchTimelineData(pbClient, controller.signal);
    } else {
       setIsLoading(true);
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchTimelineData]);

  const chartData = useMemo(() => {
    const enrichedTasks = allTasks.map(task => {
      const taskStartDateObj = startOfDay(new Date(task.startDate!));
      const taskDueDateObj = startOfDay(new Date(task.dueDate!));
      const isValidationType = task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP";
      const taskIsMilestone = isValidationType && (task.isMilestone === true || (task.isMilestone !== false && isValid(taskStartDateObj) && isValid(taskDueDateObj) && isSameDay(taskStartDateObj, taskDueDateObj)));
      const isParent = task.task_type === "VALIDATION_PROJECT";

      const children = isParent ? allTasks.filter(child => child.task_type === "VALIDATION_STEP" && child.dependencies?.includes(task.id)) : [];

      return {
        ...task,
        startDate: taskStartDateObj,
        dueDate: taskDueDateObj,
        progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
        isMilestone: taskIsMilestone,
        isParent: isParent,
        dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
        children,
        assignee: employees.find(e => e.name === task.assignedTo_text)
      };
    });

    let tasksToFilter = enrichedTasks;
    if (filterTaskType === "VALIDATION_PROJECT") {
        tasksToFilter = enrichedTasks.filter(t => t.task_type === "VALIDATION_PROJECT" || t.task_type === "VALIDATION_STEP");
    } else if (filterTaskType === "ALL_EXCEPT_VALIDATION") {
        tasksToFilter = enrichedTasks.filter(t => t.task_type !== "VALIDATION_PROJECT" && t.task_type !== "VALIDATION_STEP");
    }

    const tasksById = new Map(tasksToFilter.map(t => [t.id, t]));

    const projectColorMap = new Map<string, typeof PROJECT_COLORS[0]>();
    let colorIndex = 0;
    const rootProjects = tasksToFilter.filter(t => t.isParent);
    rootProjects.forEach(proj => {
      if (!projectColorMap.has(proj.id)) {
        projectColorMap.set(proj.id, PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]);
        colorIndex++;
      }
    });

    const getProjectRootId = (taskId: string, allTasksMap: Map<string, any>, visited = new Set<string>()): string | null => {
      if (visited.has(taskId)) return null; // cycle detection
      visited.add(taskId);
      const task = allTasksMap.get(taskId);
      if (!task) return null;
      if (task.isParent) return task.id;
      if (task.dependencies && task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          const rootId = getProjectRootId(depId, allTasksMap, visited);
          if (rootId) return rootId;
        }
      }
      return null;
    };

    const tasksWithColor = tasksToFilter.map(task => {
      const rootId = getProjectRootId(task.id, tasksById);
      const color = (rootId ? projectColorMap.get(rootId) : null) ?? DEFAULT_TASK_COLOR;
      return { ...task, color };
    });

    const rootTasks = tasksWithColor.filter(t => {
        if(t.task_type === 'VALIDATION_STEP') {
            return !t.dependencies.some(depId => tasksById.has(depId) && tasksById.get(depId)?.task_type === 'VALIDATION_PROJECT');
        }
        return true;
    }).sort((a,b) => a.startDate.getTime() - b.startDate.getTime());

    const tasksToDisplay: (typeof tasksWithColor[0] & { level: number })[] = [];

    function addTask(task: typeof tasksWithColor[0], level: number) {
        tasksToDisplay.push({ ...task, level });
        if (task.isParent && !collapsedTasks.has(task.id)) {
            const childrenWithColor = task.children.map(child => {
                const childWithColor = tasksWithColor.find(t => t.id === child.id);
                return childWithColor || { ...child, color: DEFAULT_TASK_COLOR };
            });
            childrenWithColor.sort((a,b) => a.startDate.getTime() - b.startDate.getTime()).forEach(child => {
                const childTask = tasksById.get(child.id);
                if(childTask) addTask(child, level + 1);
            });
        }
    }

    rootTasks.forEach(task => addTask(task, 0));

    // --- Timescale Logic ---
    let headerData: {
        topHeaderCells: { key: string; label: string; width: number }[];
        bottomHeaderCells: { key: string; label: string; width: number }[];
        totalWidth: number;
        pixelsPerDay: number;
        chartEndDate: Date;
    } = { topHeaderCells: [], bottomHeaderCells: [], totalWidth: 0, pixelsPerDay: 0, chartEndDate: viewStartDate };

    let chartEndDate: Date;
    switch(timeScaleView) {
        case 'day': {
            chartEndDate = endOfMonth(addMonths(viewStartDate, 1));
            headerData.pixelsPerDay = 35;
            const dailyDays = eachDayOfInterval({ start: viewStartDate, end: chartEndDate });
            const monthSpans: { [key: string]: number } = {};
            dailyDays.forEach(day => {
                const monthKey = format(day, 'MMM yyyy');
                monthSpans[monthKey] = (monthSpans[monthKey] || 0) + 1;
                headerData.bottomHeaderCells.push({
                    key: format(day, 'yyyy-MM-dd'),
                    label: format(day, 'd'),
                    width: headerData.pixelsPerDay,
                });
            });
            Object.entries(monthSpans).forEach(([name, daysInMonth]) => {
                headerData.topHeaderCells.push({ key: name, label: name, width: daysInMonth * headerData.pixelsPerDay });
            });
            break;
        }
        case 'week': {
            chartEndDate = endOfMonth(addMonths(viewStartDate, 2));
            headerData.pixelsPerDay = 20;
            const dailyDays = eachDayOfInterval({ start: viewStartDate, end: chartEndDate });
            const monthSpans: { [key: string]: number } = {};
            dailyDays.forEach(day => {
                const monthKey = format(day, 'MMM yyyy');
                monthSpans[monthKey] = (monthSpans[monthKey] || 0) + 1;
                headerData.bottomHeaderCells.push({
                    key: format(day, 'yyyy-MM-dd'),
                    label: format(day, 'EEEEE'),
                    width: headerData.pixelsPerDay,
                });
            });
             Object.entries(monthSpans).forEach(([name, daysInMonth]) => {
                headerData.topHeaderCells.push({ key: name, label: name, width: daysInMonth * headerData.pixelsPerDay });
            });
            break;
        }
        case 'month': {
            chartEndDate = endOfYear(viewStartDate);
            headerData.pixelsPerDay = 4;
            const weeklyIntervals = eachWeekOfInterval({ start: startOfMonth(viewStartDate), end: chartEndDate }, { weekStartsOn: 1 });
            const monthSpans: { [key: string]: number } = {};
            weeklyIntervals.forEach(weekStart => {
                const monthKey = format(weekStart, 'MMM yyyy');
                const daysInWeek = 7;
                monthSpans[monthKey] = (monthSpans[monthKey] || 0) + daysInWeek;
                headerData.bottomHeaderCells.push({
                    key: format(weekStart, 'yyyy-MM-dd'),
                    label: `W${getISOWeek(weekStart)}`,
                    width: daysInWeek * headerData.pixelsPerDay,
                });
            });
            Object.entries(monthSpans).forEach(([name, daysInMonth]) => {
                const actualWidth = headerData.bottomHeaderCells
                    .filter(c => format(new Date(c.key), 'MMM yyyy') === name)
                    .reduce((sum, c) => sum + c.width, 0);
                headerData.topHeaderCells.push({ key: name, label: name, width: actualWidth });
            });
            break;
        }
        case 'quarter': {
            chartEndDate = endOfYear(addYears(viewStartDate, 1));
            headerData.pixelsPerDay = 2;
            const monthlyIntervals = eachMonthOfInterval({ start: startOfYear(viewStartDate), end: chartEndDate });
            const quarterSpans: { [key: string]: number } = {};
             monthlyIntervals.forEach(monthStart => {
                const quarterKey = `${format(monthStart, 'yyyy')} Q${format(monthStart, 'q')}`;
                const daysInMonth = differenceInDays(endOfMonth(monthStart), monthStart) + 1;
                quarterSpans[quarterKey] = (quarterSpans[quarterKey] || 0) + daysInMonth;
                headerData.bottomHeaderCells.push({
                    key: format(monthStart, 'yyyy-MM'),
                    label: format(monthStart, 'MMM'),
                    width: daysInMonth * headerData.pixelsPerDay
                });
            });
            Object.entries(quarterSpans).forEach(([name, daysInQuarter]) => {
                 headerData.topHeaderCells.push({ key: name, label: name.split(' ')[1], width: daysInQuarter * headerData.pixelsPerDay });
            });
            break;
        }
    }
    headerData.chartEndDate = chartEndDate;
    headerData.totalWidth = headerData.bottomHeaderCells.reduce((acc, cell) => acc + cell.width, 0);

    return {
      tasksToDisplay,
      tasksById,
      chartStartDate: viewStartDate,
      ...headerData,
    };
  }, [allTasks, employees, viewStartDate, timeScaleView, collapsedTasks, filterTaskType]);


  const { tasksToDisplay, tasksById, chartStartDate, chartEndDate, totalWidth, pixelsPerDay, topHeaderCells, bottomHeaderCells } = chartData;

  const taskRenderDetailsMap = useMemo(() => {
    const map = new Map<string, {
        task: typeof tasksToDisplay[0];
        index: number;
        barStartX: number;
        barWidth: number;
        barCenterY: number;
        effectiveStartDate: Date;
        effectiveDueDate: Date;
    }>();

    tasksToDisplay.forEach((task, index) => {
        let taskStartActual = task.startDate;
        let taskEndActual = task.dueDate;

        if (dragState && dragState.taskId === task.id) {
            const dragOffsetDays = Math.round(( (dragState.currentMouseX ?? dragState.initialMouseX) - dragState.initialMouseX) / pixelsPerDay);
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

        const taskStartDayOffset = differenceInDays(taskStartActual, chartStartDate);
        const taskDurationDays = differenceInDays(taskEndActual, taskStartActual) + 1;
        if (taskDurationDays <= 0 && !task.isMilestone) return;

        let barLeftPosition = taskStartDayOffset * pixelsPerDay;
        const barW = task.isMilestone ? MILESTONE_SIZE : taskDurationDays * pixelsPerDay;
        if (task.isMilestone) {
            barLeftPosition += (pixelsPerDay / 2) - (MILESTONE_SIZE / 2);
        }

        map.set(task.id, {
            task,
            index,
            barStartX: barLeftPosition,
            barWidth: barW,
            barCenterY: (index * ROW_HEIGHT) + (ROW_HEIGHT / 2),
            effectiveStartDate: taskStartActual,
            effectiveDueDate: taskEndActual,
        });
    });
    return map;
  }, [tasksToDisplay, chartStartDate, pixelsPerDay, dragState]);

  const dependencyLines = useMemo(() => {
    const lines: { id: string; d: string; isConflict: boolean }[] = [];

    tasksToDisplay.forEach((dependentTask) => {
        if (!dependentTask.dependencies || dependentTask.dependencies.length === 0) return;
        const dependentDetails = taskRenderDetailsMap.get(dependentTask.id);
        if (!dependentDetails) return;

        dependentTask.dependencies.forEach((predecessorId, depIndex) => {
            const predecessorDetails = taskRenderDetailsMap.get(predecessorId);
            if (!predecessorDetails) return;

            const fromX = predecessorDetails.task.isMilestone ? predecessorDetails.barStartX + MILESTONE_SIZE / 2 : predecessorDetails.barStartX + predecessorDetails.barWidth;
            const toX = dependentDetails.task.isMilestone ? dependentDetails.barStartX + MILESTONE_SIZE / 2 : dependentDetails.barStartX;

            const pathFromY = predecessorDetails.barCenterY;
            const pathToY = dependentDetails.barCenterY;
            
            const verticalSegmentX = toX - DEPENDENCY_LINE_OFFSET;
            
            const cornerRadius = 8;
            const ySign = Math.sign(pathToY - pathFromY);

            const horizontalSegment1Length = Math.abs(verticalSegmentX - fromX);
            const verticalSegmentLength = Math.abs(pathToY - pathFromY);
            const horizontalSegment2Length = DEPENDENCY_LINE_OFFSET;

            const effectiveRadius = Math.min(
                cornerRadius,
                horizontalSegment1Length / 2,
                verticalSegmentLength / 2,
                horizontalSegment2Length / 2
            );

            let pathD: string;

            if (effectiveRadius < 1 || verticalSegmentLength === 0) {
                pathD = `M ${fromX} ${pathFromY} L ${verticalSegmentX} ${pathFromY} L ${verticalSegmentX} ${pathToY} L ${toX} ${pathToY}`;
            } else {
                pathD = 
                    `M ${fromX} ${pathFromY}` +
                    ` L ${verticalSegmentX - effectiveRadius} ${pathFromY}` +
                    ` Q ${verticalSegmentX} ${pathFromY} ${verticalSegmentX} ${pathFromY + effectiveRadius * ySign}` +
                    ` L ${verticalSegmentX} ${pathToY - effectiveRadius * ySign}` +
                    ` Q ${verticalSegmentX} ${pathToY} ${verticalSegmentX + effectiveRadius} ${pathToY}` +
                    ` L ${toX} ${pathToY}`;
            }

            const isConflict = isBefore(dependentDetails.effectiveStartDate, predecessorDetails.effectiveDueDate);

            lines.push({ id: `dep-${predecessorId}-to-${dependentTask.id}-${depIndex}`, d: pathD, isConflict });
        });
    });
    return lines;
  }, [tasksToDisplay, taskRenderDetailsMap]);

    const handleTaskUpdate = useCallback(async (taskId: string, updates: Partial<Task>) => {
        if (!pbClient) return;

        const originalTask = allTasks.find(t => t.id === taskId);
        if (!originalTask) {
            return;
        }

        const updatedTask = { ...originalTask, ...updates };

        // Optimistically update UI
        setAllTasks(currentTasks =>
            currentTasks.map(t => (t.id === taskId ? updatedTask : t))
        );

        try {
            await updateTaskService(pbClient, taskId, updates);
            toast({
                title: "Task Updated",
                description: `Task "${updatedTask.title}" was successfully updated.`,
            });
        } catch (err: any) {
             // Revert on failure
            setAllTasks(currentTasks =>
                currentTasks.map(t => (t.id === taskId ? originalTask : t))
            );
            
            const isAutocancelError = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));

            if (isAutocancelError) {
                console.warn(`Task update for "${updatedTask.title}" was cancelled. This is usually not a problem.`, err);
            } else {
                toast({
                    title: "Update Failed",
                    description: getDetailedErrorMessage(err, `updating task "${originalTask.title}"`),
                    variant: "destructive",
                });
            }
        }
    }, [pbClient, allTasks, toast]);

    const handleMouseDownOnTaskBar = useCallback((e: React.MouseEvent, task: Task) => {
        if (e.button !== 0) return;
        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails) return;
        e.preventDefault();
        e.stopPropagation();
        setDragState({ type: 'drag', taskId: task.id, initialMouseX: e.clientX, originalStartDate: taskDetails.effectiveStartDate, originalDueDate: taskDetails.effectiveDueDate });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    }, [taskRenderDetailsMap]);

    const handleMouseDownOnResizeHandle = useCallback((e: React.MouseEvent, task: Task, handleType: 'start' | 'end') => {
        if (e.button !== 0) return;
        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails) return;
        e.preventDefault();
        e.stopPropagation();
        setDragState({ type: handleType === 'start' ? 'resize-start' : 'resize-end', taskId: task.id, initialMouseX: e.clientX, originalStartDate: taskDetails.effectiveStartDate, originalDueDate: taskDetails.effectiveDueDate });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, [taskRenderDetailsMap]);

    const handleMouseDownOnDependencyConnector = useCallback((e: React.MouseEvent, task: Task) => {
        if (e.button !== 0) return;
        const taskDetails = taskRenderDetailsMap.get(task.id);
        if (!taskDetails || task.isMilestone) return;

        e.preventDefault();
        e.stopPropagation();

        const ganttRect = ganttBodyRef.current?.getBoundingClientRect();
        const timelineScroll = timelineScrollContainerRef.current;
        if (!ganttRect || !timelineScroll) return;

        const initialMouseXInGrid = e.clientX - ganttRect.left + timelineScroll.scrollLeft;
        const initialMouseYInGrid = e.clientY - ganttRect.top + timelineScroll.scrollTop - 60;

        setDependencyDrawState({ sourceTaskId: task.id, sourceTaskBarEndX: taskDetails.barStartX + taskDetails.barWidth, sourceTaskBarCenterY: taskDetails.barCenterY, currentMouseX: initialMouseXInGrid, currentMouseY: initialMouseYInGrid });
        if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'crosshair';
    }, [taskRenderDetailsMap]);

    const handleConfirmDeleteTask = useCallback(async () => {
        if (!taskToDelete || !pbClient) return;
        try {
            await deleteTaskService(pbClient, taskToDelete.id);
            toast({ title: "Task Deleted", description: `Task "${taskToDelete.title}" has been deleted.` });
            fetchTimelineData(pbClient);
        } catch (err) {
            toast({ title: "Delete Failed", description: getDetailedErrorMessage(err, "deleting task"), variant: "destructive" });
        } finally {
            setIsDeleteDialogOpen(false);
            setTaskToDelete(null);
        }
    }, [taskToDelete, pbClient, toast, fetchTimelineData]);

    const toggleCollapse = (taskId: string) => {
        setCollapsedTasks(prev => {
            const newSet = new Set(prev);
            if(newSet.has(taskId)) {
                newSet.delete(taskId);
            } else {
                newSet.add(taskId);
            }
            return newSet;
        });
    }

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
                    const startChanged = !isSameDay(dragState.originalStartDate, taskDetails.effectiveStartDate);
                    const endChanged = !isSameDay(dragState.originalDueDate, taskDetails.effectiveDueDate);
                    if (startChanged || endChanged) {
                        handleTaskUpdate(dragState.taskId, { startDate: taskDetails.effectiveStartDate, dueDate: taskDetails.effectiveDueDate });
                    }
                }
                setDragState(null);
                if (ganttBodyRef.current) ganttBodyRef.current.style.cursor = 'default';
                document.body.style.userSelect = '';
            } else if (dependencyDrawState) {
                const ganttRect = ganttBodyRef.current?.getBoundingClientRect();
                const timelineScroll = timelineScrollContainerRef.current;

                if (ganttRect && timelineScroll) {
                    const releaseYInGrid = e.clientY - ganttRect.top + timelineScroll.scrollTop;

                    const targetTaskIndex = Math.floor(releaseYInGrid / ROW_HEIGHT);
                    const targetTask = tasksToDisplay[targetTaskIndex];

                    if (targetTask && targetTask.id !== dependencyDrawState.sourceTaskId) {
                        const currentTargetDeps = targetTask.dependencies || [];
                        const sourceTask = tasksById.get(dependencyDrawState.sourceTaskId);
                        const currentSourceDeps = sourceTask?.dependencies || [];

                        if (!currentTargetDeps.includes(dependencyDrawState.sourceTaskId) && !currentSourceDeps.includes(targetTask.id)) {
                            handleTaskUpdate(targetTask.id, { dependencies: [...currentTargetDeps, dependencyDrawState.sourceTaskId] });
                        } else {
                            toast({ title: "Invalid Dependency", description: "Cannot create duplicate or circular dependency.", variant: "destructive"});
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
    }, [dragState, dependencyDrawState, pixelsPerDay, taskRenderDetailsMap, handleTaskUpdate, tasksById, toast, tasksToDisplay]);

  const handlePopoverOpenChange = (isOpen: boolean, task: Task) => {
    setIsQuickEditPopoverOpen(isOpen);
    if (isOpen) {
      setQuickEditTask(task);
    } else {
      setQuickEditTask(null);
    }
  };

  const handlePanLeft = () => setViewStartDate(prev => {
    switch(timeScaleView) {
        case 'day': return subMonths(prev, 1);
        case 'week': return subMonths(prev, 1);
        case 'month': return subQuartersDateFns(prev, 1);
        case 'quarter': return subYears(prev, 1);
        default: return prev;
    }
  });
  const handlePanRight = () => setViewStartDate(prev => {
      switch(timeScaleView) {
        case 'day': return addMonths(prev, 1);
        case 'week': return addMonths(prev, 1);
        case 'month': return addQuartersDateFns(prev, 1);
        case 'quarter': return addYears(prev, 1);
        default: return prev;
    }
  });

  const refetchTasks = () => pbClient && fetchTimelineData(pbClient);

  useEffect(() => {
    let primaryScroller: 'left' | 'right' | null = null;
    const handleLeftScroll = () => {
      if (primaryScroller === 'right') return;
      primaryScroller = 'left';
      if (leftPanelScrollContainerRef.current && timelineScrollContainerRef.current) {
        timelineScrollContainerRef.current.scrollTop = leftPanelScrollContainerRef.current.scrollTop;
      }
      requestAnimationFrame(() => primaryScroller = null);
    };
    const handleRightScroll = () => {
      if (primaryScroller === 'left') return;
      primaryScroller = 'right';
      if (leftPanelScrollContainerRef.current && timelineScrollContainerRef.current) {
        leftPanelScrollContainerRef.current.scrollTop = timelineScrollContainerRef.current.scrollTop;
      }
       requestAnimationFrame(() => primaryScroller = null);
    };
    const leftEl = leftPanelScrollContainerRef.current;
    const rightEl = timelineScrollContainerRef.current;
    leftEl?.addEventListener('scroll', handleLeftScroll);
    rightEl?.addEventListener('scroll', handleRightScroll);
    return () => {
      leftEl?.removeEventListener('scroll', handleLeftScroll);
      rightEl?.removeEventListener('scroll', handleRightScroll);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10 min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" /> <p className="ml-2">Loading timeline data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 min-h-[400px]">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Failed to Load Timeline Data</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={refetchTasks} className="mt-6">Try Again</Button>
      </div>
    );
  }

  const today = startOfDay(new Date());
  const showTodayLine = isWithinInterval(today, { start: chartStartDate, end: chartEndDate });
  const todayLineLeftPosition = showTodayLine ? (differenceInDays(today, chartStartDate) * pixelsPerDay) : 0;
  const timelineGridHeight = tasksToDisplay.length * ROW_HEIGHT;

  const renderNoTasksMessage = () => (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center text-sm">
        <p className="text-muted-foreground">
          {filterTaskType === "VALIDATION_PROJECT" ? `No Validation Projects found.` :
           filterTaskType === "ALL_EXCEPT_VALIDATION" ? `No standard tasks found.` :
           "No tasks with valid dates found."}
        </p>
        <p className="text-xs mt-1 text-muted-foreground">
            {allTasks.length === 0 ? "Create a new task to get started." : "Try adjusting the date range or zoom."}
        </p>
    </div>
  );

  return (
    <TooltipProvider>
    <div ref={ganttBodyRef} className="gantt-chart-root flex flex-col h-[calc(100vh-250px)] overflow-hidden bg-background border border-border rounded-lg shadow-sm">
      <div className="flex justify-between items-center p-2 border-b border-border flex-shrink-0">
        {displayHeaderControls === 'addValidationButton' ? (
            <Link href="/tasks/new?defaultType=VALIDATION_PROJECT" passHref>
              <Button variant="outline" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Validation Project
              </Button>
            </Link>
          ) : ( <div/> )}
         <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md bg-muted p-1 text-sm">
                {(['day', 'week', 'month', 'quarter'] as const).map(view => (
                    <Button key={view} size="sm" variant={timeScaleView === view ? 'outline' : 'ghost'} className="h-7 px-2 capitalize" onClick={() => setTimeScaleView(view)}>
                        {view}
                    </Button>
                ))}
            </div>
            <Button variant="outline" size="sm" onClick={handlePanLeft}><ChevronLeft className="h-4 w-4 mr-1" />Prev</Button>
            <span className="font-medium text-sm text-muted-foreground tabular-nums w-48 text-center">{format(viewStartDate, "MMM yyyy")} - {format(chartEndDate, "MMM yyyy")}</span>
            <Button variant="outline" size="sm" onClick={handlePanRight}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: `${LEFT_PANEL_WIDTH}px` }} className="flex-shrink-0 border-r border-border flex flex-col">
          <div className="h-[60px] flex items-center p-2 font-semibold text-xs border-b border-border flex-shrink-0 sticky top-0 bg-background/95 backdrop-blur-sm z-20 text-muted-foreground uppercase tracking-wider">
            <div className="grid grid-cols-[1fr_80px_80px] w-full items-center gap-2">
                <span>Task Name</span>
                <span className="text-center">Assignee</span>
                <span className="text-center">Due Date</span>
            </div>
          </div>
          <div ref={leftPanelScrollContainerRef} className="overflow-y-scroll flex-1">
            {tasksToDisplay.length === 0 && !isLoading && renderNoTasksMessage()}
            {tasksToDisplay.map((task) => (
                <div
                  key={`${task.id}-leftpanel`}
                  className={cn(
                    "grid grid-cols-[1fr_80px_80px] items-center gap-2 p-2 border-b border-border/60 text-sm group",
                    task.id === hoveredTaskId ? 'bg-primary/5' : ''
                  )}
                  style={{ height: `${ROW_HEIGHT}px`, paddingLeft: `${1 + task.level * 1.5}rem` }}
                  onMouseEnter={() => setHoveredTaskId(task.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                >
                    <div className="flex items-center gap-1 truncate">
                        {task.isParent && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 -ml-6" onClick={() => toggleCollapse(task.id)}>
                                <ChevronDown className={cn("h-4 w-4 transition-transform", !collapsedTasks.has(task.id) && "rotate-[-90deg]")} />
                            </Button>
                        )}
                        <span className="font-medium truncate" title={task.title}>{task.title}</span>
                        {task.isParent && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/tasks/new?defaultType=VALIDATION_STEP&dependsOnValidationProject=${task.id}`);
                                }}
                                title="Add a step to this project"
                            >
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center justify-center">
                        {task.assignee ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Avatar className="h-6 w-6">
                                    <AvatarFallback>{getInitials(task.assignee.name)}</AvatarFallback>
                                </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>{task.assignee.name}</TooltipContent>
                        </Tooltip>
                        ) : (<div className="h-6 w-6"/>)}
                    </div>
                    <span className={cn("text-center text-xs", isBefore(task.dueDate, today) && task.status !== 'Done' ? 'text-destructive' : 'text-muted-foreground')}>
                        {format(task.dueDate, 'MMM dd')}
                    </span>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-4 w-4"/></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setQuickEditTask(task); setIsQuickEditPopoverOpen(true); }}>Edit</DropdownMenuItem>
                                {task.isParent && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/tasks/new?defaultType=VALIDATION_STEP&dependsOnValidationProject=${task.id}`); }}>Add Step</DropdownMenuItem>}
                                <DropdownMenuItem className="text-destructive" onClick={() => { setTaskToDelete(task); setIsDeleteDialogOpen(true); }}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {quickEditTask?.id === task.id && (
                             <Popover open={isQuickEditPopoverOpen} onOpenChange={(isOpen) => handlePopoverOpenChange(isOpen, task)}>
                                <PopoverTrigger asChild><span/></PopoverTrigger>
                                <PopoverContent className="w-96 p-4" side="bottom" align="start">
                                    <QuickEditForm task={quickEditTask} onSave={handleTaskUpdate} onClose={() => setIsQuickEditPopoverOpen(false)} />
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto" ref={timelineScrollContainerRef}>
           <div className="relative timeline-inner-content">
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
              <div className="flex h-[30px] border-b border-border">
                {topHeaderCells.map((cell) => (
                  <div key={cell.key} style={{width: `${cell.width}px`}} className="flex-shrink-0 flex items-center justify-center border-r border-border font-semibold text-xs text-muted-foreground">{cell.label}</div>
                ))}
              </div>
              <div className="flex h-[30px] border-b border-border">
                 {bottomHeaderCells.map((cell) => (
                  <div key={cell.key} style={{width: `${cell.width}px`}} className="flex-shrink-0 flex items-center justify-center border-r border-border text-xs text-muted-foreground">{cell.label}</div>
                ))}
              </div>
            </div>
            <div className="relative" style={{height: `${timelineGridHeight}px`, width: `${totalWidth}px`}}>
                <div className="absolute inset-0 flex">
                    {bottomHeaderCells.map((cell) => (
                        <div key={cell.key} style={{width: `${cell.width}px`}} className="flex-shrink-0 border-r border-border/40 h-full"></div>
                    ))}
                </div>
                <div className="absolute inset-0">
                    {tasksToDisplay.map((task, taskIndex) => (
                        <div key={`row-${task.id}`} className={cn("absolute left-0 right-0 border-b border-border/40", task.id === hoveredTaskId ? 'bg-primary/5' : '')} style={{ top: `${taskIndex * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px`, width: `${totalWidth}px` }}></div>
                    ))}
                </div>

                {showTodayLine && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-[5]" style={{ left: `${todayLineLeftPosition}px` }} title={`Today: ${format(today, 'PPP')}`}>
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-destructive text-white text-[10px] px-1 rounded-sm font-semibold">TODAY</div>
                  </div>
                )}

                <svg width={totalWidth} height={timelineGridHeight} className="absolute inset-0 pointer-events-none z-10">
                    <defs>
                      <marker id="arrowhead" markerWidth={ARROW_SIZE*1.2} markerHeight={ARROW_SIZE*0.8} refX={ARROW_SIZE*1.1} refY={ARROW_SIZE*0.4} orient="auto-start-reverse">
                        <polygon points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE*0.4}, 0 ${ARROW_SIZE*0.8}`} className="fill-muted-foreground/70" />
                      </marker>
                      <marker id="arrowhead-conflict" markerWidth={ARROW_SIZE*1.2} markerHeight={ARROW_SIZE*0.8} refX={ARROW_SIZE*1.1} refY={ARROW_SIZE*0.4} orient="auto-start-reverse">
                        <polygon points={`0 0, ${ARROW_SIZE} ${ARROW_SIZE*0.4}, 0 ${ARROW_SIZE*0.8}`} className="fill-amber-500" />
                      </marker>
                    </defs>
                    {dependencyLines.map(line => (
                      <path key={line.id} d={line.d} strokeWidth="1.2" fill="none" markerEnd={line.isConflict ? "url(#arrowhead-conflict)" : "url(#arrowhead)"} className={cn(line.isConflict ? 'stroke-amber-500' : 'stroke-muted-foreground/70', 'transition-stroke')}/>
                    ))}
                </svg>

                {dependencyDrawState && (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-40">
                        <line x1={dependencyDrawState.sourceTaskBarEndX} y1={dependencyDrawState.sourceTaskBarCenterY} x2={dependencyDrawState.currentMouseX} y2={dependencyDrawState.currentMouseY} stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="4 2"/>
                    </svg>
                )}

                <div className="absolute inset-0">
                {tasksToDisplay.map((task, taskIndex) => {
                  const taskDetails = taskRenderDetailsMap.get(task.id);
                  if (!taskDetails) return null;

                  const isBeingDragged = dragState?.taskId === task.id;
                  const milestoneColor = task.task_type === 'VALIDATION_PROJECT'
                      ? MILESTONE_COLORS.VALIDATION_PROJECT
                      : task.task_type === 'VALIDATION_STEP'
                      ? MILESTONE_COLORS.VALIDATION_STEP
                      : MILESTONE_COLORS.DEFAULT;

                  return (
                      <Tooltip key={`${task.id}-timeline`} delayDuration={isBeingDragged ? 999999 : 100}>
                        <TooltipTrigger asChild>
                          <div
                            onMouseDown={(e) => handleMouseDownOnTaskBar(e, task)}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className={cn("absolute transition-opacity duration-150 ease-in-out group z-10 flex items-center justify-center cursor-grab rounded-md")}
                            style={{ left: `${taskDetails.barStartX}px`, width: `${taskDetails.barWidth < 0 ? 0 : taskDetails.barWidth}px`, top: `${(taskIndex * ROW_HEIGHT) + TASK_BAR_VERTICAL_PADDING}px`, height: ROW_HEIGHT - (TASK_BAR_VERTICAL_PADDING * 2) }}
                          >
                           {task.isMilestone ? (
                                <>
                                <div className={cn("absolute inset-0 flex items-center justify-center pointer-events-none", milestoneColor.base, milestoneColor.hover)} style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', width: MILESTONE_SIZE, height: MILESTONE_SIZE, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }} />
                                <span className="absolute text-xs text-foreground/80 whitespace-nowrap" style={{ left: `calc(100% + 4px)`, top: '50%', transform: 'translateY(-50%)' }}>{task.title}</span>
                                </>
                            ) : (
                              <>
                                <div className={cn("h-full w-full rounded-md", task.color.base, task.color.hover)}>
                                    <div className={cn("h-full rounded-md", task.color.progress)} style={{ width: `${task.progress || 0}%` }}/>
                                </div>
                                <div
                                    onMouseDown={(e) => handleMouseDownOnResizeHandle(e, task, 'start')}
                                    className="absolute top-1/2 -translate-y-1/2 -left-1 w-3 h-3 rounded-full bg-background border-2 border-primary cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Resize start date"
                                />
                                <div
                                    onMouseDown={(e) => handleMouseDownOnResizeHandle(e, task, 'end')}
                                    className="absolute top-1/2 -translate-y-1/2 -right-1 w-3 h-3 rounded-full bg-background border-2 border-primary cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Resize end date"
                                />
                                <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background cursor-crosshair z-30 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDownOnDependencyConnector(e, task)} title="Draw dependency"/>
                              </>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 shadow-lg bg-popover text-popover-foreground rounded-md border max-w-xs w-auto z-50">
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">{task.title}</p>
                            <p className="text-xs text-muted-foreground">Type: <span className="font-medium text-foreground">{task.task_type.replace(/_/g, ' ')}</span></p>
                            <p className="text-xs text-muted-foreground">Dates: {format(task.startDate, 'MMM d, yy')} - {format(task.dueDate, 'MMM d, yy')}</p>
                            {task.assignee && (<p className="text-xs text-muted-foreground">Assigned to: <span className="font-medium text-foreground">{task.assignee.name}</span></p>)}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                  );
                })}
                </div>
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
                    <AlertDialogDescription>Are you sure you want to delete the task "{taskToDelete.title}"? This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDeleteTask} className={cn(buttonVariants({variant: "destructive"}))}>Delete Task</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </TooltipProvider>
  );
};


interface QuickEditFormProps {
  task: Task & { isMilestone?: boolean };
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
      isMilestone: (task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP") ? !!task.isMilestone : false,
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const watchedIsMilestone = form.watch("isMilestone");
  const watchedStartDate = form.watch("startDate");

  useEffect(() => {
    if ((task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP") && watchedIsMilestone && watchedStartDate) {
      if (!form.getValues("dueDate") || form.getValues("dueDate")?.getTime() !== watchedStartDate.getTime()) {
        form.setValue("dueDate", watchedStartDate, { shouldValidate: true });
      }
    }
  }, [watchedIsMilestone, watchedStartDate, task.task_type, form]);


  const onSubmit = async (data: QuickEditFormData) => {
    setIsSubmitting(true);
    const updates: Partial<Task> = { title: data.title, startDate: data.startDate, dueDate: data.dueDate };
    if (task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP") {
      updates.isMilestone = data.isMilestone;
       if (data.isMilestone && data.startDate) { updates.dueDate = data.startDate; }
    }
    try {
      await onSave(task.id, updates);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <h4 className="font-medium text-sm leading-none">Edit: {task.title}</h4>
      <div>
        <Label htmlFor="quickEditTitle">Task Name</Label>
        <Input id="quickEditTitle" {...form.register("title")} className="mt-1" />
        {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
      </div>
      {(task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP") && (
        <div className="flex items-center space-x-2"><Controller name="isMilestone" control={form.control} render={({ field }) => ( <Checkbox id="quickEditIsMilestone" checked={field.value} onCheckedChange={field.onChange} /> )}/> <Label htmlFor="quickEditIsMilestone" className="text-sm font-normal">Is Milestone</Label></div>
      )}
      <div>
        <Label>Start Date</Label>
        <Controller control={form.control} name="startDate" render={({field}) => (
            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/></PopoverContent></Popover>
        )}/>
        {form.formState.errors.startDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.startDate.message}</p>}
      </div>
      {!watchedIsMilestone && (
        <div>
          <Label>Due Date</Label>
          <Controller control={form.control} name="dueDate" render={({field}) => (
            <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => form.watch("startDate") ? date < form.watch("startDate")! : false} initialFocus/></PopoverContent></Popover>
          )}/>
          {form.formState.errors.dueDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.dueDate.message}</p>}
        </div>
      )}
      <div className="flex justify-end space-x-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}><XCircle className="mr-2 h-4 w-4" />Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save</Button>
      </div>
    </form>
  );
};


export default GanttChart;

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", lg: "h-11 rounded-md px-8", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
