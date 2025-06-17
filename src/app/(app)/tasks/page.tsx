
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { Task, TaskStatus, TaskPriority, TaskRecurrence, Employee, TaskType } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Filter, Loader2, AlertTriangle, CheckCircle2, Circle, CalendarIcon, Save, Link as LinkIcon, Milestone } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { deleteTask, getTasks, updateTask } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService"; // Assuming this service exists
import { useToast } from "@/hooks/use-toast";
import type PocketBase from "pocketbase";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_RECURRENCES, TASK_TYPES, INSTRUMENT_SUBTYPES, SOP_SUBTYPES, MDL_INSTRUMENTS_WITH_METHODS } from "@/lib/constants";
import type { DateRange } from "react-day-picker";

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

const getStatusBadgeVariant = (status?: string) => {
  if (!status) return "default";
  const lowerStatus = status.toLowerCase();
  switch (lowerStatus) {
    case "done": return "default";
    case "in progress": return "secondary";
    case "overdue": return "destructive";
    case "blocked": return "destructive";
    case "to do": return "outline";
    default: return "outline";
  }
};

const getDetailedErrorMessage = (error: any, context: string = "tasks"): string => {
  let message = `An unexpected error occurred while managing ${context}.`;

  if (error && typeof error === 'object') {
    const errorContext = error.context || context;

    if (error.isCircuitOpenError === true) {
      const openUntil = error.openUntil;
      if (openUntil && Date.now() < openUntil) {
        const remainingSeconds = Math.ceil((openUntil - Date.now()) / 1000);
        const timeString = remainingSeconds > 60
          ? `${Math.ceil(remainingSeconds / 60)} minute(s)`
          : `${remainingSeconds} second(s)`;
        return `Too many recent connection issues with '${errorContext}'. Access is temporarily paused. Please try again in about ${timeString}.`;
      }
      return `Access to '${errorContext}' is temporarily paused due to repeated connection issues. Please try again in a few moments.`;
    }

    if (error.circuitJustOpened === true) {
      return `Failed to connect to '${errorContext}' after multiple attempts. To allow the service to recover, further attempts will be paused for a short period. Please try again in a few moments.`;
    }

    if ('status' in error && error.status === 0) {
      message = `Failed to load ${errorContext}: Could not connect to the server. Please check your internet connection and try again.`;
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
        let collectionTypeForStatusMsg = "items";
        if (errorContext.includes("task")) collectionTypeForStatusMsg = "tasks";
        else if (errorContext.includes("employee")) collectionTypeForStatusMsg = "employees";

        const isGenericMessage = message.startsWith("An unexpected error occurred") || message.startsWith("PocketBase_ClientResponseError") || message === error.message;

        if (status === 404 && isGenericMessage) {
            message = `The requested ${collectionTypeForStatusMsg} could not be found (404).`;
        } else if (status === 403 && isGenericMessage) {
            message = `You do not have permission to access or modify these ${collectionTypeForStatusMsg} (403).`;
        } else if (isGenericMessage && message.startsWith("PocketBase_ClientResponseError")) {
            message = `A server error occurred (${status}) while managing ${collectionTypeForStatusMsg}. If this persists, please contact support.`;
        } else if (isGenericMessage) {
            message = `${message} (Status: ${status})`;
        }
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

const taskEditFormSchema = z.object({
  task_type: z.enum(TASK_TYPES as [TaskType, ...TaskType[]], { errorMap: () => ({ message: "Please select a valid task type."}) }),
  instrument_subtype: z.string().optional(),
  method: z.string().optional(),
  description: z.string().optional(),
  status: z.string().min(1, "Status is required.") as z.ZodType<TaskStatus>,
  priority: z.string().min(1, "Priority is required.") as z.ZodType<TaskPriority>,
  startDate: z.date().optional(),
  dueDate: z.date().optional(),
  recurrence: z.enum(TASK_RECURRENCES as [TaskRecurrence, ...TaskRecurrence[]]),
  assignedTo_text: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  isMilestone: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.task_type === "MDL" && !data.instrument_subtype) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Instrument Subtype is required for MDL tasks.",
      path: ["instrument_subtype"],
    });
  }
  if (data.task_type === "MDL" && data.instrument_subtype && MDL_INSTRUMENTS_WITH_METHODS[data.instrument_subtype]?.length > 0 && !data.method) {
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Method is required for the selected instrument subtype: ${data.instrument_subtype}.`,
        path: ["method"],
    });
  }
  if (data.task_type === "SOP" && !data.instrument_subtype) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SOP Subtype is required for SOP tasks.",
      path: ["instrument_subtype"],
    });
  }

  if (data.task_type === "VALIDATION_PROJECT") {
    if (data.isMilestone && !data.startDate) {
     ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Milestone date (Start Date) is required for a Validation Project milestone.",
        path: ["startDate"],
      });
    }
     if (data.recurrence !== "None") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Recurrence must be 'None' for Validation Projects.",
            path: ["recurrence"],
        });
    }
  } else if (data.task_type === "VALIDATION_STEP") {
    if (data.isMilestone === true) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Milestones are not applicable to Validation Step tasks.",
            path: ["isMilestone"],
        });
    }
    if (data.recurrence && data.recurrence !== "None") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Recurrence must be 'None' for Validation Step tasks.",
            path: ["recurrence"],
        });
    }
  } else { 
    if (data.isMilestone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Milestones are only applicable to 'VALIDATION_PROJECT' tasks.",
        path: ["isMilestone"],
      });
    }
     if (!data.recurrence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurrence is required for this task type.",
        path: ["recurrence"],
      });
    }
  }

  if (!(data.task_type === "VALIDATION_PROJECT" && data.isMilestone)) {
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
        ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be before or same as due date.",
        path: ["startDate"],
        });
    }
  }
});

type TaskEditFormData = z.infer<typeof taskEditFormSchema>;
type FilterStatusOption = 'incomplete' | 'complete' | 'all';

let allTasksForSelection: Task[] = [];

export default function TasksPage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryStatusMessage, setRetryStatusMessage] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatusOption>('incomplete');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [fetchEmployeesError, setFetchEmployeesError] = useState<string | null>(null);

  const [allTasksForDependencyEdit, setAllTasksForDependencyEdit] = useState<Task[]>([]);
  const [isLoadingTasksForDependencyEdit, setIsLoadingTasksForDependencyEdit] = useState(true);
  const [fetchTasksErrorEdit, setFetchTasksErrorEdit] = useState<string | null>(null);

  const [dependenciesRetryMessage, setDependenciesRetryMessage] = useState<string | null>(null);
  const [isDependenciesPopoverOpenEdit, setIsDependenciesPopoverOpenEdit] = useState(false);
  const [isDatePickerOpenEdit, setIsDatePickerOpenEdit] = useState(false);


  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const form = useForm<TaskEditFormData>({
    resolver: zodResolver(taskEditFormSchema),
    defaultValues: {
      task_type: TASK_TYPES.find(t => t !== "VALIDATION_PROJECT" && t!== "VALIDATION_STEP") || TASK_TYPES[0],
      instrument_subtype: undefined,
      method: undefined,
      dependencies: [],
      isMilestone: false,
      recurrence: "None",
    }
  });

  const watchedTaskType = form.watch("task_type");
  const watchedInstrumentSubtype = form.watch("instrument_subtype");
  const watchedIsMilestone = form.watch("isMilestone");
  const watchedFormStartDate = form.watch("startDate");
  const watchedFormDueDate = form.watch("dueDate");


  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "task_type") {
        if (value.task_type !== "MDL" && value.task_type !== "SOP") {
          form.setValue("instrument_subtype", undefined, { shouldValidate: true });
          form.setValue("method", undefined, {shouldValidate: true});
        } else if (value.task_type === "MDL") {
           const currentInstrument = form.getValues("instrument_subtype");
           const currentMethod = form.getValues("method");
           if (currentInstrument && MDL_INSTRUMENTS_WITH_METHODS[currentInstrument] && !MDL_INSTRUMENTS_WITH_METHODS[currentInstrument].includes(currentMethod || '')) {
                form.setValue("method", undefined, { shouldValidate: true });
           }
        } else if (value.task_type === "SOP") {
            form.setValue("method", undefined, {shouldValidate: true});
        }

        if (value.task_type === "VALIDATION_PROJECT" || value.task_type === "VALIDATION_STEP") {
           form.setValue("recurrence", "None", { shouldValidate: true });
        } else {
           if (form.getValues("recurrence") === "None" && !(editingTask && editingTask.recurrence === "None" && editingTask.task_type !== "VALIDATION_PROJECT" && editingTask.task_type !== "VALIDATION_STEP" )) {
           }
        }
         if (value.task_type === "VALIDATION_STEP") {
           form.setValue("isMilestone", false, { shouldValidate: true });
        } else if (value.task_type !== "VALIDATION_PROJECT") {
            form.setValue("isMilestone", false, { shouldValidate: true });
        }

      }
      if (name === "instrument_subtype" && form.getValues("task_type") === "MDL") {
        const currentMethod = form.getValues("method");
        const newInstrument = value.instrument_subtype;
        if (newInstrument && MDL_INSTRUMENTS_WITH_METHODS[newInstrument] && !MDL_INSTRUMENTS_WITH_METHODS[newInstrument].includes(currentMethod || '')) {
            form.setValue("method", undefined, { shouldValidate: true });
        } else if (!newInstrument) {
            form.setValue("method", undefined, { shouldValidate: true });
        }
      }
      if (name === "isMilestone" || name === "startDate") {
        if (form.getValues("task_type") === "VALIDATION_PROJECT" && form.getValues("isMilestone") && form.getValues("startDate")) {
          const currentStartDate = form.getValues("startDate");
          if (!form.getValues("dueDate") || form.getValues("dueDate")?.getTime() !== currentStartDate!.getTime()) {
            form.setValue("dueDate", currentStartDate, { shouldValidate: true });
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, editingTask]);


  const fetchTasksCallback = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setRetryStatusMessage(null);

    const handleRetryAttempt = (attempt: number, maxAttempts: number, err: any) => {
      const isNetworkError = err && err.status === 0;
      const isRetryableServerError = err && [502, 503, 504].includes(err.status);
      if (isNetworkError || isRetryableServerError) {
        setRetryStatusMessage(`Connection issues, retrying... Attempt ${attempt} of ${maxAttempts}`);
      } else {
        setRetryStatusMessage(`Attempting to recover... Attempt ${attempt} of ${maxAttempts}`);
      }
    };

    let pbFilter = 'task_type != "VALIDATION_PROJECT" && task_type != "VALIDATION_STEP"';
    if (filterStatus === 'incomplete') {
      pbFilter += ' && status != "Done"';
    } else if (filterStatus === 'complete') {
      pbFilter += ' && status = "Done"';
    }

    try {
      const fetchedTasks = await getTasks(pb, {
        signal,
        onRetry: handleRetryAttempt,
        filter: pbFilter
      });
      setTasks(fetchedTasks);
      setRetryStatusMessage(null);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;
      setRetryStatusMessage(null);

      if (isAutocancel) {
        console.warn(`Tasks fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err, "tasks");
        setError(detailedError);
        toast({ title: "Error Loading Tasks", description: detailedError, variant: "destructive" });
        console.warn("Tasks fetch (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err, "tasks");
        setError(detailedError);
        toast({ title: "Error Loading Tasks", description: detailedError, variant: "destructive" });
        console.warn("Error fetching tasks (after retries):", detailedError, err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, filterStatus]);

  const fetchAndSetEmployees = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoadingEmployees(false);
      return;
    }
    setIsLoadingEmployees(true);
    setFetchEmployeesError(null);
    const handleEmployeeRetry = (attempt: number, maxAttempts: number, error: any) => {
        setRetryStatusMessage(`Retrying employee data... Attempt ${attempt} of ${maxAttempts}`);
    };

    try {
      const fetchedEmployees = await getEmployees(pb, { signal, onRetry: handleEmployeeRetry });
      setEmployees(fetchedEmployees);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (isAutocancel) {
         console.warn(`Fetch employees for task edit request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (err?.status === 0 && !isAutocancel) {
        const detailedError = getDetailedErrorMessage(err, "employees for task assignment");
        setFetchEmployeesError(detailedError);
        toast({ title: "Error Loading Employees", description: detailedError, variant: "destructive" });
        console.warn("Fetch employees for task edit (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err, "employees for task assignment");
        setFetchEmployeesError(detailedError);
        toast({ title: "Error Loading Employees", description: detailedError, variant: "destructive" });
        console.warn("Error fetching employees for task edit (after retries):", detailedError, err);
      }
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast]);

  const fetchAllTasksForDepEdit = useCallback(async (pb: PocketBase | null, currentEditingTaskId: string | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoadingTasksForDependencyEdit(false);
      return;
    }
    setIsLoadingTasksForDependencyEdit(true);
    setFetchTasksErrorEdit(null);
    setDependenciesRetryMessage(null);

    const handleDepRetry = (attempt: number, maxAttempts: number, error: any) => {
      setDependenciesRetryMessage(`Retrying tasks for selection... Attempt ${attempt} of ${maxAttempts}`);
    };

    try {
      const fetchedTasks = await getTasks(pb, {
        signal,
        onRetry: handleDepRetry
      });

      const filteredForEdit = currentEditingTaskId ? fetchedTasks.filter(t => t.id !== currentEditingTaskId) : fetchedTasks;
      setAllTasksForDependencyEdit(filteredForEdit);
      allTasksForSelection = filteredForEdit;
      setDependenciesRetryMessage(null);
    } catch (err: any) {
      setDependenciesRetryMessage(null);
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`Fetch tasks for edit dependency selection request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err, "tasks for dependency selection (edit)");
        setFetchTasksErrorEdit(detailedError);
        toast({ title: "Error Loading Tasks for Dependencies", description: detailedError, variant: "destructive" });
        console.warn("Fetch tasks for edit dependency selection (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err, "tasks for dependency selection (edit)");
        setFetchTasksErrorEdit(detailedError);
        toast({ title: "Error Loading Tasks for Dependencies", description: detailedError, variant: "destructive" });
        console.warn("Error fetching tasks for edit dependency selection (after retries):", detailedError, err);
      }
    } finally {
      setIsLoadingTasksForDependencyEdit(false);
    }
  }, [toast]);


  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchTasksCallback(pbClient, controller.signal);
      fetchAndSetEmployees(pbClient, controller.signal);
    } else {
      setIsLoading(true);
      setIsLoadingEmployees(true);
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchTasksCallback, fetchAndSetEmployees, filterStatus]);

  useEffect(() => {
    if (isEditDialogOpen && editingTask && pbClient && editingTask.task_type !== "VALIDATION_STEP") {
      const controller = new AbortController();
      fetchAllTasksForDepEdit(pbClient, editingTask.id, controller.signal);
      return () => controller.abort();
    } else if (!isEditDialogOpen || (editingTask && editingTask.task_type === "VALIDATION_STEP")) {
        setAllTasksForDependencyEdit([]);
        allTasksForSelection = [];
        setIsLoadingTasksForDependencyEdit(false);
    }
  }, [isEditDialogOpen, editingTask, pbClient, fetchAllTasksForDepEdit]);


  useEffect(() => {
    if (editingTask) {
      form.reset({
        task_type: editingTask.task_type,
        instrument_subtype: editingTask.instrument_subtype || undefined,
        method: editingTask.method || undefined,
        description: editingTask.description || "",
        status: editingTask.status,
        priority: editingTask.priority,
        startDate: editingTask.startDate ? new Date(editingTask.startDate) : undefined,
        dueDate: editingTask.dueDate ? new Date(editingTask.dueDate) : undefined,
        recurrence: (editingTask.task_type === "VALIDATION_PROJECT" || editingTask.task_type === "VALIDATION_STEP") ? "None" : (editingTask.recurrence || "None"),
        assignedTo_text: editingTask.assignedTo_text || "",
        dependencies: Array.isArray(editingTask.dependencies) ? editingTask.dependencies : [],
        isMilestone: editingTask.task_type === "VALIDATION_STEP" ? false : (editingTask.isMilestone || false),
      });
    }
  }, [editingTask, form]);


  const handleToggleTaskStatus = useCallback(async (taskId: string, currentStatus: TaskStatus) => {
    if (!pbClient) {
      toast({ title: "Error", description: "Client not available.", variant: "destructive" });
      return;
    }

    const newStatus: TaskStatus = currentStatus === "Done" ? "To Do" : "Done";
    const currentTasks = tasks;
    const optimisticUpdatedTasks = currentTasks.map(task =>
      task.id === taskId ? { ...task, status: newStatus } : task
    );
    setTasks(optimisticUpdatedTasks);

    try {
      const updatedTaskRecord = await updateTask(pbClient, taskId, { status: newStatus });
      setTasks(prevTasks => prevTasks.map(t => t.id === updatedTaskRecord.id ? updatedTaskRecord : t));
      toast({ title: "Success", description: `Task marked as ${newStatus}.` });
    } catch (err) {
      console.warn("Error updating task status:", err);
      setTasks(currentTasks);
      toast({ title: "Error", description: `Failed to update task status: ${getDetailedErrorMessage(err as any)}`, variant: "destructive" });
    }
  }, [pbClient, toast, tasks]); 

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!pbClient) {
        toast({ title: "Error", description: "Client not available.", variant: "destructive" });
        return;
    }
    const originalTasks = [...tasks];
    setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    try {
      await deleteTask(pbClient, taskId);
      toast({ title: "Success", description: "Task deleted successfully." });
    } catch (err) {
      console.warn("Error deleting task:", err);
      setTasks(originalTasks);
      toast({ title: "Error", description: getDetailedErrorMessage(err as any), variant: "destructive" });
    }
  }, [pbClient, toast, tasks]); 

  const handleEditClick = useCallback((task: Task) => {
    setEditingTask(task);
    setIsEditDialogOpen(true);
  }, []);

  const handleEditDialogClose = () => {
    setIsEditDialogOpen(false);
    setEditingTask(null);
    form.reset();
    setAllTasksForDependencyEdit([]);
    allTasksForSelection = [];
    setIsDependenciesPopoverOpenEdit(false);
    setIsDatePickerOpenEdit(false);
  };


  const onEditSubmit = async (data: TaskEditFormData) => {
    if (!editingTask || !pbClient || !user) {
      toast({ title: "Error", description: "Editing context, client or user not available.", variant: "destructive" });
      return;
    }
    setIsSubmittingEdit(true);

    const payload: Partial<Task> & { userId: string } = {
      title: data.task_type, 
      task_type: data.task_type, 
      instrument_subtype: (data.task_type === "MDL" || data.task_type === "SOP") ? data.instrument_subtype : undefined,
      method: (data.task_type === "MDL" && data.instrument_subtype && MDL_INSTRUMENTS_WITH_METHODS[data.instrument_subtype]?.length > 0) ? data.method : undefined,
      description: data.description,
      status: data.status,
      priority: data.priority,
      startDate: data.startDate,
      dueDate: (data.task_type === "VALIDATION_PROJECT" && data.isMilestone && data.startDate) ? data.startDate : data.dueDate,
      recurrence: data.recurrence, 
      assignedTo_text: data.assignedTo_text === "__NONE__" || !data.assignedTo_text ? undefined : data.assignedTo_text,
      isMilestone: data.task_type === "VALIDATION_PROJECT" ? data.isMilestone : false,
      dependencies: data.task_type === "VALIDATION_STEP" ? editingTask.dependencies : (data.dependencies || []),
      userId: user.id,
    };

    try {
      const updatedTaskRecord = await updateTask(pbClient, editingTask.id, payload);
      setTasks(prevTasks => prevTasks.map(t => t.id === updatedTaskRecord.id ? updatedTaskRecord : t));
      toast({ title: "Success", description: "Task updated successfully." });
      handleEditDialogClose();
    } catch (err: any) {
      console.warn("Failed to update task:", err);
      let detailedMessage = getDetailedErrorMessage(err);
      if (err.data?.data?.instrument_subtype?.message) {
        detailedMessage = `Instrument Subtype: ${err.data.data.instrument_subtype.message}`;
      } else if (err.data?.data?.method?.message) {
        detailedMessage = `Method: ${err.data.data.method.message}`;
      }
      toast({ title: "Error Updating Task", description: detailedMessage, variant: "destructive" });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDateSelectEdit = (selected: Date | DateRange | undefined) => {
    const currentTaskType = form.getValues("task_type");
    const currentIsMilestone = form.getValues("isMilestone");

    if (currentTaskType === "VALIDATION_PROJECT" && currentIsMilestone) {
      const singleDate = selected as Date | undefined;
      form.setValue("startDate", singleDate, { shouldValidate: true });
      form.setValue("dueDate", singleDate, { shouldValidate: true });
    } else {
      const range = selected as DateRange | undefined;
      form.setValue("startDate", range?.from, { shouldValidate: true });
      form.setValue("dueDate", range?.to, { shouldValidate: true });
    }

    if (selected) {
        if (!(currentTaskType === "VALIDATION_PROJECT" && currentIsMilestone) && (selected as DateRange)?.from && !(selected as DateRange)?.to) {
        } else {
            setIsDatePickerOpenEdit(false);
        }
    }
  };

  let datePickerButtonTextEdit = "Pick a date";
  if (watchedTaskType === "VALIDATION_PROJECT" && watchedIsMilestone) {
    datePickerButtonTextEdit = watchedFormStartDate ? `Milestone: ${format(watchedFormStartDate, "PPP")}` : "Pick Milestone Date";
  } else {
    if (watchedFormStartDate && watchedFormDueDate) {
      datePickerButtonTextEdit = `${format(watchedFormStartDate, "PPP")} - ${format(watchedFormDueDate, "PPP")}`;
    } else if (watchedFormStartDate) {
      datePickerButtonTextEdit = `${format(watchedFormStartDate, "PPP")} - Select End Date`;
    } else {
      datePickerButtonTextEdit = "Pick Date Range";
    }
  }


  const refetchTasks = () => {
    if (pbClient) {
      const controller = new AbortController();
      fetchTasksCallback(pbClient, controller.signal);
    }
  }

  const isLoadingInitialData = isLoading || isLoadingEmployees;
  const filterStatusDisplay = filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1);
  const availableMethodsForEdit = useMemo(() => {
    if (watchedTaskType === "MDL" && watchedInstrumentSubtype && MDL_INSTRUMENTS_WITH_METHODS[watchedInstrumentSubtype]) {
        return MDL_INSTRUMENTS_WITH_METHODS[watchedInstrumentSubtype];
    }
    return [];
  }, [watchedTaskType, watchedInstrumentSubtype]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Task Management</h1>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" /> Filter: {filterStatusDisplay}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value as FilterStatusOption)}
              >
                <DropdownMenuRadioItem value="incomplete">Incomplete</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="complete">Complete</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/tasks/new" passHref>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Task
            </Button>
          </Link>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Task List ({filterStatusDisplay})</CardTitle>
          <CardDescription>
            View, manage, and track laboratory tasks based on the selected filter.
            (Excludes Validation Projects & Steps).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInitialData && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">{retryStatusMessage || 'Loading tasks and employee data...'}</p>
            </div>
          )}
          {error && !isLoadingInitialData && !retryStatusMessage && (
            <div className="text-center py-10 text-destructive">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Tasks</p>
              <p className="text-sm">{error}</p>
              <Button onClick={refetchTasks} className="mt-6">Try Again</Button>
            </div>
          )}
          {!isLoadingInitialData && !error && tasks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <p>No tasks found matching the current filter: "{filterStatusDisplay}".</p>
              {filterStatus !== 'all' && <p className="text-sm">Try selecting a different filter or adding new tasks.</p>}
            </div>
          )}
          {!isLoadingInitialData && !error && tasks.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Name / Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium flex items-center">
                       {task.title.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      {(task.task_type === "MDL" || task.task_type === "SOP") && task.instrument_subtype && (
                        <span className="block text-xs">{task.instrument_subtype}</span>
                      )}
                      {task.task_type === "MDL" && task.method && (
                        <span className="block text-xs text-muted-foreground">{task.method}</span>
                      )}
                      {task.description && task.task_type !== "MDL" && task.task_type !== "SOP" && (
                        <span className="block text-xs text-muted-foreground truncate max-w-xs" title={task.description}>{task.description}</span>
                      )}
                       {(!(task.task_type === "MDL" || task.task_type === "SOP") || !task.instrument_subtype) && !task.description && "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      {task.dueDate ? format(new Date(task.dueDate), "MMM dd, yyyy") : "-"}
                      {task.recurrence && task.recurrence !== "None" && (
                        <span className="block text-xs text-muted-foreground">Repeats: {task.recurrence}</span>
                      )}
                    </TableCell>
                    <TableCell>{task.assignedTo_text || "-"}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleToggleTaskStatus(task.id, task.status)}
                            className="flex items-center w-full"
                          >
                            {task.status === "Done" ? (
                              <Circle className="mr-2 h-4 w-4" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            {task.status === "Done" ? "Mark as To Do" : "Mark as Done"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditClick(task)} className="flex items-center w-full">
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingTask && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleEditDialogClose(); else setIsEditDialogOpen(true); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-headline">Edit Task: {editingTask.task_type.replace(/_/g, ' ')}</DialogTitle>
              <DialogDescription>Make changes to the task details below.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                 <FormField
                  control={form.control}
                  name="task_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                       <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled 
                        >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select task name" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TASK_TYPES.filter(t => t !== "VALIDATION_PROJECT" && t!== "VALIDATION_STEP").map(tt => (
                            <SelectItem key={tt} value={tt}>
                              {tt.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedTaskType === "MDL" && (
                   <>
                    <FormField
                        control={form.control}
                        name="instrument_subtype"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Instrument Subtype</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select instrument for MDL" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {INSTRUMENT_SUBTYPES.map(subtype => (
                                    <SelectItem key={subtype} value={subtype}>{subtype}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    {watchedInstrumentSubtype && availableMethodsForEdit.length > 0 && (
                        <FormField
                            control={form.control}
                            name="method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Method</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select method" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {availableMethodsForEdit.map(m => (
                                                <SelectItem key={m} value={m}>{m}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                   </>
                )}
                {watchedTaskType === "SOP" && (
                   <FormField
                    control={form.control}
                    name="instrument_subtype"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>SOP Subtype</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select SOP subtype" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {SOP_SUBTYPES.map(subtype => (
                                <SelectItem key={subtype} value={subtype}>{subtype}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                )}

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Add any relevant details..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TASK_STATUSES.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TASK_PRIORITIES.map(p => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {watchedTaskType === "VALIDATION_PROJECT" && (
                  <FormField
                    control={form.control}
                    name="isMilestone"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 py-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center cursor-pointer mb-0!">
                          <Milestone className="mr-2 h-4 w-4 text-muted-foreground" /> Mark as Milestone
                        </FormLabel>
                         <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div>
                    <FormLabel>
                        {watchedTaskType === "VALIDATION_PROJECT" && watchedIsMilestone ? "Milestone Date" : "Date Range (Start - Due)"}
                    </FormLabel>
                    <Popover open={isDatePickerOpenEdit} onOpenChange={setIsDatePickerOpenEdit}>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className="w-full justify-start text-left font-normal mt-2"
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {datePickerButtonTextEdit}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode={(watchedTaskType === "VALIDATION_PROJECT" && watchedIsMilestone) ? "single" : "range"}
                            selected={(watchedTaskType === "VALIDATION_PROJECT" && watchedIsMilestone) ? watchedFormStartDate : { from: watchedFormStartDate, to: watchedFormDueDate }}
                            onSelect={handleDateSelectEdit}
                            numberOfMonths={(watchedTaskType === "VALIDATION_PROJECT" && watchedIsMilestone) ? 1 : 2}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                    <FormField control={form.control} name="startDate" render={() => <FormMessage />} />
                    <FormField control={form.control} name="dueDate" render={() => <FormMessage />} />
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {watchedTaskType !== "VALIDATION_PROJECT" && watchedTaskType !== "VALIDATION_STEP" && (
                      <FormField
                          control={form.control}
                          name="recurrence"
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>Recurrence</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                  <SelectTrigger>
                                  <SelectValue placeholder="Select recurrence" />
                                  </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                  {TASK_RECURRENCES.map(r => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                  ))}
                              </SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                    )}
                    <FormField
                        control={form.control}
                        name="assignedTo_text"
                        render={({ field }) => (
                        <FormItem className={(watchedTaskType === "VALIDATION_PROJECT" || watchedTaskType === "VALIDATION_STEP" || (watchedTaskType === "MDL" && availableMethodsForEdit.length > 0)) ? "md:col-span-2" : ""}>
                            <FormLabel>Assigned To (Optional)</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || "__NONE__"}
                              disabled={isLoadingEmployees || !!fetchEmployeesError}
                            >
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder={isLoadingEmployees ? "Loading..." : (fetchEmployeesError ? "Error" : "Select employee")} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="__NONE__">None</SelectItem>
                                {employees.map(emp => (
                                <SelectItem key={emp.id} value={emp.name}>{emp.name} ({emp.role})</SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                            {fetchEmployeesError && !isLoadingEmployees && (
                              <p className="text-sm text-destructive mt-1 flex items-center">
                                <AlertTriangle className="h-4 w-4 mr-1" /> {fetchEmployeesError}
                              </p>
                            )}
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                {watchedTaskType !== "VALIDATION_STEP" && (
                 <FormField
                  control={form.control}
                  name="dependencies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dependencies (Optional)</FormLabel>
                      <Popover open={isDependenciesPopoverOpenEdit} onOpenChange={setIsDependenciesPopoverOpenEdit}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className="w-full justify-start text-left font-normal"
                            disabled={isLoadingTasksForDependencyEdit || !!fetchTasksErrorEdit}
                          >
                            <LinkIcon className="mr-2 h-4 w-4" />
                            {isLoadingTasksForDependencyEdit ? "Loading tasks..." :
                              fetchTasksErrorEdit ? "Error loading tasks" :
                              (field.value && field.value.length > 0) ? `${field.value.length} selected` : "Select dependent tasks"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                           {dependenciesRetryMessage && (
                             <div className="p-4 text-center text-sm text-orange-600">{dependenciesRetryMessage}</div>
                           )}
                           {isLoadingTasksForDependencyEdit && !dependenciesRetryMessage ? (
                                <div className="p-4 text-center text-sm">Loading tasks...</div>
                            ) : fetchTasksErrorEdit && !dependenciesRetryMessage ? (
                                <div className="p-4 text-center text-sm text-destructive">{fetchTasksErrorEdit}</div>
                            ) : !isLoadingTasksForDependencyEdit && !fetchTasksErrorEdit && allTasksForDependencyEdit.length === 0 && !dependenciesRetryMessage ? (
                                <div className="p-4 text-center text-sm">No other tasks available to select.</div>
                            ) : !dependenciesRetryMessage && !fetchTasksErrorEdit && (
                                <ScrollArea className="h-48">
                                    <div className="p-4 space-y-2">
                                    {allTasksForDependencyEdit.map(taskItem => (
                                        <div key={taskItem.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`edit-dep-${taskItem.id}`}
                                            checked={field.value?.includes(taskItem.id)}
                                            onCheckedChange={(checked) => {
                                            const currentDeps = field.value || [];
                                            return checked
                                                ? field.onChange([...currentDeps, taskItem.id])
                                                : field.onChange(currentDeps.filter(id => id !== taskItem.id));
                                            }}
                                        />
                                        <label
                                            htmlFor={`edit-dep-${taskItem.id}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 truncate"
                                            title={taskItem.title}
                                        >
                                            {taskItem.title} ({taskItem.task_type.replace(/_/g, ' ')})
                                        </label>
                                        </div>
                                    ))}
                                    </div>
                                </ScrollArea>
                            )}
                            {(!dependenciesRetryMessage && !isLoadingTasksForDependencyEdit) && (
                                <div className="p-2 border-t">
                                    <Button type="button" size="sm" className="w-full" onClick={() => setIsDependenciesPopoverOpenEdit(false)}>
                                        Done
                                    </Button>
                                </div>
                            )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                 />
                )}

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={handleEditDialogClose} disabled={isSubmittingEdit}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingEdit || isLoadingEmployees || (isLoadingTasksForDependencyEdit && watchedTaskType !== "VALIDATION_STEP")}>
                    {isSubmittingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

