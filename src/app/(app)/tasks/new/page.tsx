
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
import { CalendarIcon, Save, UploadCloud, Loader2, AlertTriangle, Link as LinkIcon, Milestone, UserPlus } from "lucide-react";
import { format } from "date-fns";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createTask, getTasks } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import type { Employee, TaskStatus, TaskPriority, TaskRecurrence, Task, TaskType } from "@/lib/types";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_RECURRENCES, TASK_TYPES, INSTRUMENT_SUBTYPES, SOP_SUBTYPES, MDL_INSTRUMENTS_WITH_METHODS } from "@/lib/constants";
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

const getInitialTaskTypeOnClientHelper = (searchParamsInstance: URLSearchParams): TaskType => {
  const defaultTypeFromQuery = searchParamsInstance.get("defaultType") as TaskType | null;
  if (defaultTypeFromQuery && TASK_TYPES.includes(defaultTypeFromQuery)) {
    return defaultTypeFromQuery;
  }
  // Default to a non-validation type if no specific valid type is provided
  return TASK_TYPES.find(t => t !== "VALIDATION_PROJECT" && t !== "VALIDATION_STEP") || TASK_TYPES[0];
};


export default function NewTaskPage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  
  const initialTaskType = useMemo(() => getInitialTaskTypeOnClientHelper(searchParams), [searchParams]);
  const dependsOnValidationProjectQuery = searchParams.get("dependsOnValidationProject");

  const [taskType, setTaskType] = useState<TaskType>(initialTaskType);
  const [customTaskName, setCustomTaskName] = useState<string>(""); 
  const [instrumentSubtype, setInstrumentSubtype] = useState<string | undefined>();
  const [method, setMethod] = useState<string | undefined>();
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(TASK_STATUSES[0] || "To Do");
  const [priority, setPriority] = useState<TaskPriority>(TASK_PRIORITIES.find(p => p.toLowerCase() === 'medium') || TASK_PRIORITIES[0] || "Medium");
  
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [recurrence, setRecurrence] = useState<TaskRecurrence>(() => {
    const typeForRecurrence = getInitialTaskTypeOnClientHelper(searchParams); // Use a fresh check for initial state
    if (typeForRecurrence === "VALIDATION_PROJECT" || typeForRecurrence === "VALIDATION_STEP") {
      if (typeof window !== 'undefined') localStorage.setItem('newTaskFormRecurrence', "None");
      return "None";
    }
    if (typeof window !== 'undefined') {
      const savedRecurrence = localStorage.getItem('newTaskFormRecurrence');
      if (savedRecurrence && TASK_RECURRENCES.includes(savedRecurrence as TaskRecurrence)) {
        return savedRecurrence as TaskRecurrence;
      }
    }
    return "Daily"; // Default for non-validation types if nothing saved
  });

  const [assignedTo, setAssignedTo] = useState<string[]>([]);
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
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  
  const [availableMethods, setAvailableMethods] = useState<readonly string[]>([]);

  const isValidationCreationMode = useMemo(() => (
    initialTaskType === "VALIDATION_PROJECT" || 
    (initialTaskType === "VALIDATION_STEP" && !!dependsOnValidationProjectQuery)
  ), [initialTaskType, dependsOnValidationProjectQuery]);

  const availableTaskTypesToDisplay = useMemo(() => {
    if (initialTaskType === "VALIDATION_PROJECT") {
      return TASK_TYPES.filter(t => t === "VALIDATION_PROJECT");
    } else if (initialTaskType === "VALIDATION_STEP" && dependsOnValidationProjectQuery) {
      return TASK_TYPES.filter(t => t === "VALIDATION_STEP");
    } else {
      // Exclude both VP and VS from the general new task page
      return TASK_TYPES.filter(t => t !== "VALIDATION_PROJECT" && t !== "VALIDATION_STEP");
    }
  }, [initialTaskType, dependsOnValidationProjectQuery]);


  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('newTaskFormRecurrence', recurrence);
    }
  }, [recurrence]);

  useEffect(() => {
    if (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") {
      if (recurrence !== "None") {
        setRecurrence("None");
      }
    } else {
      // If switching from a validation type to non-validation, and recurrence is "None",
      // set it to a default like "Daily".
      // Also consider if a user explicitly set "None" for a non-validation task, and it was saved.
      if (recurrence === "None") {
        const savedRecurrence = typeof window !== 'undefined' ? localStorage.getItem('newTaskFormRecurrence') : null;
        if (savedRecurrence && savedRecurrence !== "None" && TASK_RECURRENCES.includes(savedRecurrence as TaskRecurrence)) {
          setRecurrence(savedRecurrence as TaskRecurrence);
        } else {
          setRecurrence("Daily"); 
        }
      }
    }
  }, [taskType, recurrence, setRecurrence]);


  useEffect(() => {
    if (taskType !== "MDL" && taskType !== "SOP") {
      setInstrumentSubtype(undefined);
      setMethod(undefined);
      setAvailableMethods([]);
    } else if (taskType === "MDL") {
      if (instrumentSubtype && MDL_INSTRUMENTS_WITH_METHODS[instrumentSubtype]) {
        setAvailableMethods(MDL_INSTRUMENTS_WITH_METHODS[instrumentSubtype]);
      } else {
        setAvailableMethods([]);
      }
      if (instrumentSubtype && MDL_INSTRUMENTS_WITH_METHODS[instrumentSubtype] && !MDL_INSTRUMENTS_WITH_METHODS[instrumentSubtype].includes(method || '')) {
        setMethod(undefined);
      }
    } else { 
        setMethod(undefined);
        setAvailableMethods([]);
    }

    if ((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone && startDate) {
      setDueDate(startDate);
    } else if ((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone && !startDate) {
      setDueDate(undefined);
    }
    
    if (taskType !== "VALIDATION_PROJECT" && taskType !== "VALIDATION_STEP") {
      setIsMilestone(false);
      setCustomTaskName("");
    }

    if (taskType === "VALIDATION_STEP") {
       if (!dependsOnValidationProjectQuery && selectedDependencies.length > 0) { 
          setSelectedDependencies([]);
      }
    } else if (taskType !== "VALIDATION_PROJECT") {
      if (!dependsOnValidationProjectQuery) {
        setSelectedDependencies([]);
      }
    }
  }, [taskType, instrumentSubtype, isMilestone, startDate, method, dependsOnValidationProjectQuery, selectedDependencies.length]);


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
      if (taskType !== "VALIDATION_STEP") { 
        fetchAllTasksForDependencySelection(pbClient, controller.signal);
      } else {
        setIsLoadingTasksForSelection(false); 
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

  const handleAssigneeChange = (employeeId: string) => {
    setAssignedTo(prev =>
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in to create a task.", variant: "destructive" });
      return;
    }
    
    const finalTitle = (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP")
      ? customTaskName.trim()
      : taskType;

    if (!finalTitle) {
      let errorMsg = "Task Type (which serves as Name) is required.";
      if (taskType === "VALIDATION_PROJECT") errorMsg = "Project Name is required.";
      if (taskType === "VALIDATION_STEP") errorMsg = "Step Name is required.";
      toast({ title: "Validation Error", description: errorMsg, variant: "destructive" });
      return;
    }

    if (taskType === "MDL" && !instrumentSubtype) {
      toast({ title: "Validation Error", description: `Instrument Subtype is required for ${taskType} tasks.`, variant: "destructive" });
      return;
    }
    if (taskType === "MDL" && instrumentSubtype && MDL_INSTRUMENTS_WITH_METHODS[instrumentSubtype]?.length > 0 && !method) {
      toast({ title: "Validation Error", description: `Method is required for the selected ${instrumentSubtype}.`, variant: "destructive" });
      return;
    }
    if (taskType === "SOP" && !instrumentSubtype) {
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
    if (!(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && (!effectiveRecurrence || !TASK_RECURRENCES.includes(effectiveRecurrence))) {
      toast({ title: "Validation Error", description: "Task recurrence is required for this task type.", variant: "destructive" });
      return;
    }
    if ((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone && !startDate) {
      toast({ title: "Validation Error", description: "Milestone date is required for a Validation milestone.", variant: "destructive" });
      return;
    }
    if (!((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) && startDate && dueDate && startDate > dueDate) {
       toast({ title: "Validation Error", description: "Start date must be before or same as due date.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", finalTitle); 
    formData.append("task_type", taskType);

    if (taskType === "MDL" && instrumentSubtype) {
        formData.append("instrument_subtype", instrumentSubtype);
        if (method) {
            formData.append("method", method);
        }
    } else if (taskType === "SOP" && instrumentSubtype) {
      formData.append("instrument_subtype", instrumentSubtype);
    }

    if (description.trim()) {
      formData.append("description", description);
    }
    formData.append("status", status);
    formData.append("priority", priority);
    formData.append("recurrence", effectiveRecurrence);
    
    formData.append("isMilestone", (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") ? isMilestone.toString() : "false");
    
    if (selectedDependencies.length > 0) {
        formData.append("dependencies", JSON.stringify(selectedDependencies));
    }

    if (startDate) {
      formData.append("startDate", startDate.toISOString());
    }
    if (dueDate) {
        formData.append("dueDate", dueDate.toISOString());
    }

    if (assignedTo.length > 0) {
      assignedTo.forEach(id => formData.append("assignedTo", id));
    }
    formData.append("userId", user.id); 
    
    if (attachments) {
      for (let i = 0; i < attachments.length; i++) {
        formData.append("attachments", attachments[i]);
      }
    }

    try {
      await createTask(pbClient, formData);
      toast({ title: "Success", description: `New ${finalTitle} task created successfully!` });
      if (taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP" || dependsOnValidationProjectQuery) {
        router.push("/validations");
      } else {
        router.push("/tasks");
      }
    } catch (err: any) {
      toast({
        title: "Error Creating Task",
        description: err.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isLoadingPrerequisites = isLoadingEmployees || (isLoadingTasksForSelection && taskType !== "VALIDATION_STEP");
  

  const handleDateSelect = (selected: Date | DateRange | undefined) => {
    if ((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) {
      const singleDate = selected as Date | undefined;
      setStartDate(singleDate);
      setDueDate(singleDate);
    } else {
      const range = selected as DateRange | undefined;
      setStartDate(range?.from);
      setDueDate(range?.to);
    }
    if (selected) { 
        if (!((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) && (selected as DateRange)?.from && !(selected as DateRange)?.to) {
          // Keep picker open if only start date is selected for a range
        } else {
            setIsDatePickerOpen(false);
        }
    }
  };

  let datePickerButtonText = "Pick a date";
  if ((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) {
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
  const isCreatingValidationProject = taskType === "VALIDATION_PROJECT" || initialTaskType === "VALIDATION_PROJECT";
  
  const assigneeButtonText = assignedTo.length === 0
    ? "Select employees (Optional)"
    : assignedTo.length === 1
    ? employees.find(e => e.id === assignedTo[0])?.name || "1 employee selected"
    : `${assignedTo.length} employees selected`;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">
          {isCreatingValidationProject ? "New Validation Project" : 
           (isCreatingStepTask ? `New Step for Validation Project` : "Add New Task")}
        </h1>
        <Button variant="outline" asChild>
          <Link href={isCreatingValidationProject || isCreatingStepTask ? "/validations" : "/tasks"}>Cancel</Link>
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Task Details</CardTitle>
          <CardDescription>Fill in the information for the new task.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isValidationCreationMode && (
              <div>
                <Label htmlFor="task_type_select">Task Type</Label>
                <Select
                  value={taskType}
                  onValueChange={(value: TaskType) => {
                    setTaskType(value);
                    if (value !== "VALIDATION_PROJECT" && value !== "VALIDATION_STEP") {
                      setCustomTaskName(""); // Clear custom name if not a VP or VS
                    }
                  }}
                >
                  <SelectTrigger id="task_type_select">
                    <SelectValue placeholder="Select task type" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTaskTypesToDisplay.map(tt => (
                      <SelectItem key={tt} value={tt}>{tt.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && (
              <div>
                <Label htmlFor="customTaskName">
                  {taskType === "VALIDATION_PROJECT" ? "Project Name" : "Step Name"}
                </Label>
                <Input 
                  id="customTaskName" 
                  placeholder={taskType === "VALIDATION_PROJECT" ? "Enter the project name" : "Enter the step name"}
                  value={customTaskName} 
                  onChange={(e) => setCustomTaskName(e.target.value)} 
                />
              </div>
            )}

            {(taskType === "MDL") && (
              <>
                <div>
                  <Label htmlFor="instrumentSubtypeMDL">Instrument Subtype</Label>
                  <Select 
                    value={instrumentSubtype} 
                    onValueChange={(value: string) => {
                      setInstrumentSubtype(value);
                      if (value && MDL_INSTRUMENTS_WITH_METHODS[value] && !MDL_INSTRUMENTS_WITH_METHODS[value].includes(method || '')) {
                        setMethod(undefined);
                      } else if (!value) {
                        setMethod(undefined);
                      }
                      setAvailableMethods(value ? MDL_INSTRUMENTS_WITH_METHODS[value] || [] : []);
                    }}
                  >
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
                {instrumentSubtype && availableMethods.length > 0 && (
                  <div>
                    <Label htmlFor="methodMDL">Method</Label>
                    <Select value={method} onValueChange={(value: string) => setMethod(value)}>
                      <SelectTrigger id="methodMDL">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMethods.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
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

            {(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && (
              <div className="flex items-center space-x-2">
                <Checkbox id="isMilestone" checked={isMilestone} onCheckedChange={(checked) => setIsMilestone(Boolean(checked))} />
                <Label htmlFor="isMilestone" className="flex items-center cursor-pointer">
                  <Milestone className="mr-2 h-4 w-4 text-muted-foreground" /> Mark as Milestone
                </Label>
              </div>
            )}
            
            <div>
              <Label htmlFor="dateRangePicker">
                {(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone ? "Milestone Date" : "Date Range (Start - Due)"}
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
                    mode={((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) ? "single" : "range"}
                    selected={((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) ? startDate : { from: startDate, to: dueDate }}
                    onSelect={handleDateSelect}
                    numberOfMonths={((taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP") && isMilestone) ? 1 : 2}
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
              <div className={(taskType === "VALIDATION_PROJECT" || taskType === "VALIDATION_STEP" || (taskType === "MDL" && availableMethods.length > 0) || (taskType !== "VALIDATION_PROJECT" && taskType !== "VALIDATION_STEP") ) ? "md:col-span-2" : ""}>
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Popover open={isAssigneePopoverOpen} onOpenChange={setIsAssigneePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal"
                        disabled={isLoadingEmployees || !!fetchEmployeesError}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        {isLoadingEmployees ? "Loading employees..." : 
                            fetchEmployeesError ? "Error loading" :
                            assigneeButtonText}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <ScrollArea className="h-48">
                        <div className="p-4 space-y-2">
                        {employees.map(employee => (
                          <div key={employee.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`assignee-${employee.id}`}
                              checked={assignedTo.includes(employee.id)}
                              onCheckedChange={() => handleAssigneeChange(employee.id)}
                            />
                            <Label htmlFor={`assignee-${employee.id}`} className="font-normal cursor-pointer">
                              {employee.name} ({employee.role})
                            </Label>
                          </div>
                        ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                </Popover>
                {fetchEmployeesError && !isLoadingEmployees && (
                   <p className="text-sm text-destructive mt-1 flex items-center">
                     <AlertTriangle className="h-4 w-4 mr-1" /> {fetchEmployeesError}
                   </p>
                )}
              </div>
            </div>
            
            {taskType !== "VALIDATION_STEP" && ( 
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
