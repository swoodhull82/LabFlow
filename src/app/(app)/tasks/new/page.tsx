
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon, Save, UploadCloud, Loader2, AlertTriangle, Link as LinkIcon, Milestone } from "lucide-react";
import { format } from "date-fns";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createTask, getTasks } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import type { Employee, TaskStatus, TaskPriority, TaskRecurrence, Task, TaskType } from "@/lib/types";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_RECURRENCES, TASK_TYPES, INSTRUMENT_SUBTYPES, SOP_SUBTYPES } from "@/lib/constants";
import type PocketBase from "pocketbase";
import type { DateRange } from "react-day-picker";

const getDetailedEmployeeFetchErrorMessage = (error: any): string => {
  let message = "Could not load employees for assignment.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      return "Failed to load employees for assignment: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.message) {
      message = error.message;
    }
  }
  return message;
};

const getDetailedTaskFetchErrorMessage = (error: any): string => {
  let message = "Could not load tasks for dependency selection.";
   if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      return "Failed to load tasks for dependency selection: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.message) {
      message = error.message;
    }
  }
  return message;
};


export default function NewTaskPage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const defaultTypeFromQuery = searchParams.get("defaultType") as TaskType | null;
  const dependsOnValidationProjectQuery = searchParams.get("dependsOnValidationProject");
  const defaultTitleFromQuery = searchParams.get("defaultTitle");


  const [taskType, setTaskType] = useState<TaskType>(defaultTypeFromQuery || TASK_TYPES.find(t => t !== "VALIDATION_PROJECT" && t !== "VALIDATION_STEP") || TASK_TYPES[0]);
  const [title, setTitle] = useState<string>(defaultTitleFromQuery || "");
  const [instrumentSubtype, setInstrumentSubtype] = useState<string | undefined>();
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(TASK_STATUSES[0] || "To Do");
  const [priority, setPriority] = useState<TaskPriority>(TASK_PRIORITIES.find(p => p.toLowerCase() === 'medium') || TASK_PRIORITIES[0] || "Medium");
  
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [recurrence, setRecurrence] = useState<TaskRecurrence>(TASK_RECURRENCES.find(r => r.toLowerCase() === 'none') || TASK_RECURRENCES[0] || "None");
  const [assignedToText, setAssignedToText] = useState<string | undefined>();
  const [attachments, setAttachments] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMilestone, setIsMilestone] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [fetchEmployeesError, setFetchEmployeesError] = useState<string | null>(null);

  const [allTasksForSelection, setAllTasksForSelection] = useState<Task[]>([]);
  const [isLoadingTasksForSelection, setIsLoadingTasksForSelection] = useState(true);
  const [fetchTasksError, setFetchTasksError] = useState<string | null>(null);
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(dependsOnValidationProjectQuery ? [dependsOnValidationProjectQuery] : []);
  const [isDependenciesPopoverOpen, setIsDependenciesPopoverOpen] = useState(false);

  useEffect(() => {
    if (defaultTypeFromQuery) {
      setTaskType(defaultTypeFromQuery);
      if (defaultTypeFromQuery === "VALIDATION_PROJECT" || defaultTypeFromQuery === "VALIDATION_STEP") {
        setRecurrence("None"); 
      }
    }
    if (dependsOnValidationProjectQuery) {
        setSelectedDependencies([dependsOnValidationProjectQuery]);
    }
    if (defaultTitleFromQuery) {
        setTitle(defaultTitleFromQuery);
    }
  }, [defaultTypeFromQuery, dependsOnValidationProjectQuery, defaultTitleFromQuery]);

  const fetchAndSetEmployees = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoadingEmployees(false);
      return;
    }
    setIsLoadingEmployees(true);
    setFetchEmployeesError(null);
    try {
      const fetchedEmployees = await getEmployees(pb, { signal });
      setEmployees(fetchedEmployees);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;
      
      if (isAutocancel) {
        console.warn(`Fetch employees for task assignment request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
          const detailedError = getDetailedEmployeeFetchErrorMessage(err);
          setFetchEmployeesError(detailedError); 
          toast({ title: "Error Loading Employees", description: detailedError, variant: "destructive" });
          console.warn("Fetch employees for task assignment (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedEmployeeFetchErrorMessage(err);
        setFetchEmployeesError(detailedError);
        toast({ title: "Error Loading Employees", description: detailedError, variant: "destructive" });
        console.warn("Error fetching employees for task assignment (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast]);

  const fetchAllTasksForDependencySelection = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoadingTasksForSelection(false);
      return;
    }
    setIsLoadingTasksForSelection(true);
    setFetchTasksError(null);
    try {
      const fetchedTasks = await getTasks(pb, { signal }); 
      setAllTasksForSelection(fetchedTasks);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
       const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`Fetch tasks for dependency selection request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedTaskFetchErrorMessage(err);
        setFetchTasksError(detailedError);
        toast({ title: "Error Loading Tasks for Dependencies", description: detailedError, variant: "destructive" });
        console.warn("Fetch tasks for dependency selection (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedTaskFetchErrorMessage(err);
        setFetchTasksError(detailedError);
        toast({ title: "Error Loading Tasks for Dependencies", description: detailedError, variant: "destructive" });
        console.warn("Error fetching tasks for dependency selection (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoadingTasksForSelection(false);
    }
  }, [toast]);


  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchAndSetEmployees(pbClient, controller.signal);
      if (taskType !== "VALIDATION_STEP") { // Only fetch for general dependencies if not a VALIDATION_STEP
        fetchAllTasksForDependencySelection(pbClient, controller.signal);
      } else {
        setIsLoadingTasksForSelection(false); // Not needed for VALIDATION_STEP
        setAllTasksForSelection([]);
      }
    } else {
      setIsLoadingEmployees(true); 
      setIsLoadingTasksForSelection(true);
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchAndSetEmployees, fetchAllTasksForDependencySelection, taskType]);

  useEffect(() => {
    if (taskType !== "MDL" && taskType !== "SOP") {
      setInstrumentSubtype(undefined);
    }
    if (taskType === "VALIDATION_PROJECT") {
      setRecurrence("None"); 
    } else if (taskType === "VALIDATION_STEP") {
      setIsMilestone(false);
      setRecurrence("None");
       if (!dependsOnValidationProjectQuery) { // Only clear general dependencies if not pre-filled
          setSelectedDependencies([]);
      }
    } else { // For other task types
      setIsMilestone(false);
      if (!dependsOnValidationProjectQuery) {
        setSelectedDependencies([]);
      }
    }


    if (taskType === "VALIDATION_PROJECT" && isMilestone && startDate) {
      setDueDate(startDate);
    } else if (taskType === "VALIDATION_PROJECT" && isMilestone && !startDate) {
      setDueDate(undefined);
    }
  }, [taskType, isMilestone, startDate, recurrence, defaultTypeFromQuery, dependsOnValidationProjectQuery]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachments(event.target.files);
    }
  };

  const handleDependencyChange = (taskId: string) => {
    setSelectedDependencies(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in to create a task.", variant: "destructive" });
      return;
    }
    if (!taskType) {
      toast({ title: "Validation Error", description: "Task Type is required.", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Validation Error", description: "Task Name is required.", variant: "destructive" });
      return;
    }
    if ((taskType === "MDL" || taskType === "SOP") && !instrumentSubtype) {
      toast({ title: "Validation Error", description: `Subtype is required for ${taskType} tasks.`, variant: "destructive" });
      return;
    }
    if (!status) {
      toast({ title: "Validation Error", description: "Task status is required.", variant: "destructive" });
      return;
    }
    if (!priority) {
      toast({ title: "Validation Error", description: "Task priority is required.", variant: "destructive" });
      return;
    }
    
    const effectiveRecurrence = (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") ? "None" : recurrence;
    if (taskType !== "VALIDATION_PROJECT" && taskType !== "VALIDATION_STEP" && (!effectiveRecurrence || !TASK_RECURRENCES.includes(effectiveRecurrence))) {
      toast({ title: "Validation Error", description: "Task recurrence is required for this task type.", variant: "destructive" });
      return;
    }
    if (taskType === "VALIDATION_PROJECT" && isMilestone && !startDate) {
      toast({ title: "Validation Error", description: "Milestone date is required for a Validation milestone.", variant: "destructive" });
      return;
    }
    if (!(taskType === "VALIDATION_PROJECT" && isMilestone) && startDate && dueDate && startDate > dueDate) {
       toast({ title: "Validation Error", description: "Start date must be before or same as due date.", variant: "destructive" });
      return;
    }


    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("task_type", taskType);
    formData.append("title", title);

    if ((taskType === "MDL" || taskType === "SOP") && instrumentSubtype) {
      formData.append("instrument_subtype", instrumentSubtype);
    }
    formData.append("description", description);
    formData.append("status", status);
    formData.append("priority", priority);
    formData.append("recurrence", effectiveRecurrence);
    
    if (taskType === "VALIDATION_PROJECT") {
        formData.append("isMilestone", isMilestone.toString());
    } else {
        formData.append("isMilestone", "false"); // also for VALIDATION_STEP
    }
    
    // Only append general dependencies if it's not a VALIDATION_STEP or if they are explicitly managed
    // For VALIDATION_STEP, selectedDependencies should already contain the parent project link.
    if (selectedDependencies.length > 0) {
        formData.append("dependencies", JSON.stringify(selectedDependencies));
    }


    if (startDate) {
      formData.append("startDate", startDate.toISOString());
    }
    if (dueDate) {
        formData.append("dueDate", dueDate.toISOString());
    }


    if (assignedToText) {
      formData.append("assignedTo_text", assignedToText);
    }
    formData.append("userId", user.id); 
    
    if (attachments) {
      for (let i = 0; i < attachments.length; i++) {
        formData.append("attachments", attachments[i]);
      }
    }

    try {
      await createTask(pbClient, formData);
      toast({ title: "Success", description: `New ${taskType.replace(/_/g, ' ')} task created successfully!` });
      if (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP" || dependsOnValidationProjectQuery) {
        router.push("/validations");
      } else {
        router.push("/tasks");
      }
    } catch (err: any) {
      console.error("Failed to create task (full error object):", err); 
      let detailedMessage = "Failed to create task. Please try again.";
      
      if (err.data && typeof err.data === 'object') {
        let mainErrorMessage = "";
        if (err.data.message && typeof err.data.message === 'string') {
          mainErrorMessage = err.data.message;
        }

        let fieldErrorString = "";
        if (err.data.data && typeof err.data.data === 'object' && Object.keys(err.data.data).length > 0) {
          fieldErrorString = Object.entries(err.data.data)
            .map(([key, val]: [string, any]) => {
              const message = val && val.message ? val.message : 'Invalid value';
              return `${key}: ${message}`;
            })
            .join("; ");
        }

        if (mainErrorMessage && fieldErrorString) {
          detailedMessage = `${mainErrorMessage}. Details: ${fieldErrorString}`;
        } else if (mainErrorMessage) {
          detailedMessage = mainErrorMessage;
        } else if (fieldErrorString) {
          detailedMessage = `Validation errors: ${fieldErrorString}`;
        } else if (Object.keys(err.data).length > 0 && detailedMessage === "Failed to create task. Please try again.") {
            try {
                detailedMessage = `PocketBase error: ${JSON.stringify(err.data)}`;
            } catch (e) {
                detailedMessage = `PocketBase error: Could not stringify error data.`;
            }
        }
      } else if (err.message && typeof err.message === 'string') { 
        detailedMessage = err.message;
      }
      
      toast({
        title: "Error Creating Task",
        description: detailedMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isLoadingPrerequisites = isLoadingEmployees || (isLoadingTasksForSelection && taskType !== "VALIDATION_STEP");
  
  const availableTaskTypes = (defaultTypeFromQuery && (defaultTypeFromQuery === "VALIDATION_PROJECT" || defaultTypeFromQuery === "VALIDATION_STEP") && dependsOnValidationProjectQuery) 
    ? TASK_TYPES.filter(t => t === defaultTypeFromQuery) // If it's a step task, lock type
    : defaultTypeFromQuery === "VALIDATION_PROJECT" 
      ? TASK_TYPES.filter(t => t === "VALIDATION_PROJECT") 
      : TASK_TYPES;


  const handleDateSelect = (selected: Date | DateRange | undefined) => {
    if (taskType === "VALIDATION_PROJECT" && isMilestone) {
      const singleDate = selected as Date | undefined;
      setStartDate(singleDate);
      setDueDate(singleDate);
    } else {
      const range = selected as DateRange | undefined;
      setStartDate(range?.from);
      setDueDate(range?.to);
    }
    if (selected) { 
        if (!(taskType === "VALIDATION_PROJECT" && isMilestone) && (selected as DateRange)?.from && !(selected as DateRange)?.to) {
        } else {
            setIsDatePickerOpen(false);
        }
    }
  };

  let datePickerButtonText = "Pick a date";
  if (taskType === "VALIDATION_PROJECT" && isMilestone) {
    datePickerButtonText = startDate ? `Milestone: ${format(startDate, "PPP")}` : "Pick Milestone Date";
  } else {
    if (startDate && dueDate) {
      datePickerButtonText = `${format(startDate, "PPP")} - ${format(dueDate, "PPP")}`;
    } else if (startDate) {
      datePickerButtonText = `${format(startDate, "PPP")} - Select End Date`;
    } else {
      datePickerButtonText = "Pick Date Range";
    }
  }


  if (!pbClient && !isLoadingPrerequisites) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline">Initializing Task Creation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Initializing task creation form...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCreatingStepTask = taskType === "VALIDATION_STEP" && !!dependsOnValidationProjectQuery;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">
          {taskType === "VALIDATION_PROJECT" ? "New Validation Project" : 
           (isCreatingStepTask ? `New Step for Validation Project` : "Add New Task")}
        </h1>
        <Button variant="outline" asChild>
          <Link href={taskType === "VALIDATION_PROJECT" || isCreatingStepTask ? "/validations" : "/tasks"}>Cancel</Link>
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Task Details</CardTitle>
          <CardDescription>Fill in the information for the new task.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="task_type">Task Type</Label>
              <Select 
                value={taskType} 
                onValueChange={(value: TaskType) => {
                  setTaskType(value);
                  setInstrumentSubtype(undefined); 
                  setIsMilestone(false);
                  if (!dependsOnValidationProjectQuery) { 
                      setSelectedDependencies([]);
                  }
                  if (value === "VALIDATION_PROJECT" || value === "VALIDATION_STEP") {
                    setRecurrence("None");
                  }
                }}
                disabled={!!(defaultTypeFromQuery && (defaultTypeFromQuery === "VALIDATION_PROJECT" || defaultTypeFromQuery === "VALIDATION_STEP") && dependsOnValidationProjectQuery)}
              >
                <SelectTrigger id="task_type">
                  <SelectValue placeholder="Select task type" />
                </SelectTrigger>
                <SelectContent>
                  {availableTaskTypes.map(tt => (
                    <SelectItem key={tt} value={tt}>{tt.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">
                {taskType === "VALIDATION_PROJECT" ? "Validation Project Name" : 
                 (isCreatingStepTask ? "Step Name" : "Task Name")}
              </Label>
              <Input 
                id="title" 
                placeholder={
                  taskType === "VALIDATION_PROJECT" ? "e.g., New HPLC Method Validation" : 
                  (isCreatingStepTask ? "e.g., Protocol Definition" : "e.g., Daily Balances Check")
                } 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
              />
            </div>

            {(taskType === "MDL") && (
              <div>
                <Label htmlFor="instrumentSubtypeMDL">Instrument Subtype</Label>
                <Select value={instrumentSubtype} onValueChange={(value: string) => setInstrumentSubtype(value)}>
                  <SelectTrigger id="instrumentSubtypeMDL">
                    <SelectValue placeholder="Select instrument for MDL" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTRUMENT_SUBTYPES.map(subtype => (
                      <SelectItem key={subtype} value={subtype}>{subtype}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(taskType === "SOP") && (
              <div>
                <Label htmlFor="instrumentSubtypeSOP">SOP Subtype</Label>
                <Select value={instrumentSubtype} onValueChange={(value: string) => setInstrumentSubtype(value)}>
                  <SelectTrigger id="instrumentSubtypeSOP">
                    <SelectValue placeholder="Select SOP subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOP_SUBTYPES.map(subtype => (
                      <SelectItem key={subtype} value={subtype}>{subtype}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Add any relevant details or instructions..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value: TaskStatus) => setStatus(value)} >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(value: TaskPriority) => setPriority(value)} >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {taskType === "VALIDATION_PROJECT" && (
              <div className="flex items-center space-x-2">
                <Checkbox id="isMilestone" checked={isMilestone} onCheckedChange={(checked) => setIsMilestone(Boolean(checked))} />
                <Label htmlFor="isMilestone" className="flex items-center cursor-pointer">
                  <Milestone className="mr-2 h-4 w-4 text-muted-foreground" /> Mark as Milestone
                </Label>
              </div>
            )}
            
            <div>
              <Label htmlFor="dateRangePicker">
                {taskType === "VALIDATION_PROJECT" && isMilestone ? "Milestone Date" : "Date Range (Start - Due)"}
              </Label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="dateRangePicker"
                    variant={"outline"}
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {datePickerButtonText}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode={(taskType === "VALIDATION_PROJECT" && isMilestone) ? "single" : "range"}
                    selected={(taskType === "VALIDATION_PROJECT" && isMilestone) ? startDate : { from: startDate, to: dueDate }}
                    onSelect={handleDateSelect}
                    numberOfMonths={(taskType === "VALIDATION_PROJECT" && isMilestone) ? 1 : 2}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {taskType !== "VALIDATION_PROJECT" && taskType !== "VALIDATION_STEP" && (
                <div>
                  <Label htmlFor="recurrence">Recurrence</Label>
                  <Select value={recurrence} onValueChange={(value: TaskRecurrence) => setRecurrence(value)} >
                    <SelectTrigger id="recurrence">
                      <SelectValue placeholder="Select recurrence" />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_RECURRENCES.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") ? "md:col-span-2" : ""}>
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Select 
                  onValueChange={(value: string) => setAssignedToText(value === "__NONE__" ? undefined : value)} 
                  value={assignedToText || "__NONE__"}
                  disabled={isLoadingEmployees || !!fetchEmployeesError}
                >
                  <SelectTrigger id="assignedTo_text">
                    <SelectValue placeholder={isLoadingEmployees ? "Loading employees..." : (fetchEmployeesError ? "Error loading employees" : "Select employee (Optional)")} />
                  </SelectTrigger>
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
              </div>
            </div>
            
            {taskType !== "VALIDATION_STEP" && ( // Hide for VALIDATION_STEP as dependency is pre-set
            <div>
              <Label htmlFor="dependencies">Dependencies (Optional)</Label>
                <Popover open={isDependenciesPopoverOpen} onOpenChange={setIsDependenciesPopoverOpen}>
                  <PopoverTrigger asChild>
                      <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                      disabled={isLoadingTasksForSelection || !!fetchTasksError}
                      >
                      <LinkIcon className="mr-2 h-4 w-4" />
                      {isLoadingTasksForSelection ? "Loading tasks..." : 
                          fetchTasksError ? "Error loading tasks" :
                          selectedDependencies.length > 0 ? `${selectedDependencies.length} selected` : "Select tasks"}
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      {isLoadingTasksForSelection ? (
                            <div className="p-4 text-center text-sm">Loading tasks...</div>
                      ) : fetchTasksError ? (
                          <div className="p-4 text-center text-sm text-destructive">{fetchTasksError}</div>
                      ) : allTasksForSelection.length === 0 ? (
                            <div className="p-4 text-center text-sm">No tasks available to select as dependencies.</div>
                      ) : (
                          <ScrollArea className="h-48">
                              <div className="p-4 space-y-2">
                              {allTasksForSelection.map(taskItem => (
                                  <div key={taskItem.id} className="flex items-center space-x-2">
                                  <Checkbox
                                      id={`dep-${taskItem.id}`}
                                      checked={selectedDependencies.includes(taskItem.id)}
                                      onCheckedChange={() => handleDependencyChange(taskItem.id)}
                                      disabled={dependsOnValidationProjectQuery === taskItem.id} 
                                  />
                                  <label
                                      htmlFor={`dep-${taskItem.id}`}
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
                        <div className="p-2 border-t">
                          <Button size="sm" className="w-full" onClick={() => setIsDependenciesPopoverOpen(false)}>
                              Done
                          </Button>
                      </div>
                  </PopoverContent>
              </Popover>
            </div>
            )}

            <div>
              <Label htmlFor="attachments">Attachments</Label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div className="flex text-sm text-muted-foreground">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-ring"
                    >
                      <span>Upload files</span>
                      <Input id="file-upload" name="file-upload" type="file" className="sr-only" multiple onChange={handleFileChange} />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-muted-foreground">PNG, JPG, PDF, etc. up to 10MB each</p>
                  {attachments && attachments.length > 0 && (
                    <div className="pt-2 text-sm text-muted-foreground">
                      Selected: {Array.from(attachments).map(file => file.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || isLoadingPrerequisites || (fetchTasksError && taskType !== "VALIDATION_STEP") || fetchEmployeesError}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Task
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
