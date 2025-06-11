
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Save, UploadCloud, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createTask } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@/lib/types";
import type PocketBase from "pocketbase";

export default function NewTaskPage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [recurrence, setRecurrence] = useState<string>("");
  const [assignedToText, setAssignedToText] = useState<string | undefined>();
  const [attachments, setAttachments] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [fetchEmployeesError, setFetchEmployeesError] = useState<string | null>(null);

  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [recurrenceOptions, setRecurrenceOptions] = useState<string[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [fetchConfigError, setFetchConfigError] = useState<string | null>(null);

  const fetchAndSetEmployees = useCallback(async (pb: PocketBase) => {
    setIsLoadingEmployees(true);
    setFetchEmployeesError(null);
    try {
      const fetchedEmployees = await getEmployees(pb);
      setEmployees(fetchedEmployees);
    } catch (err: any) {
      const isPocketBaseAutocancel = err?.isAbort === true;
      const isGeneralAutocancelOrNetworkIssue = err?.status === 0;
      const isMessageAutocancel = typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled");

      if (isPocketBaseAutocancel || isGeneralAutocancelOrNetworkIssue || isMessageAutocancel) {
        console.warn("Fetch employees request for task assignment was autocancelled or due to a network issue.", err);
      } else {
        console.error("Error fetching employees for task assignment:", err);
        const errorMessage = err.message || "Could not load employees for assignment.";
        setFetchEmployeesError(errorMessage);
        toast({ title: "Error Loading Employees", description: errorMessage, variant: "destructive" });
      }
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast]);

  const fetchTaskConfigOptions = useCallback(async (pbInstance: PocketBase) => {
    setIsLoadingConfig(true);
    setFetchConfigError(null);
    try {
      const [statusesData, prioritiesData, recurrencesData] = await Promise.all([
        pbInstance.collection('task_config_statuses').getFullList({ fields: "name", sort: "name" }),
        pbInstance.collection('task_config_priorities').getFullList({ fields: "name", sort: "name" }),
        pbInstance.collection('task_config_recurrences').getFullList({ fields: "name", sort: "name" })
      ]);

      const statusNames = statusesData.map(s => s.name);
      setStatusOptions(statusNames);
      if (statusNames.length > 0) {
        const defaultStatus = statusNames.find(s => s.toLowerCase() === 'to do') || statusNames[0];
        setStatus(defaultStatus);
      } else {
        setStatus('');
      }

      const priorityNames = prioritiesData.map(p => p.name);
      setPriorityOptions(priorityNames);
      if (priorityNames.length > 0) {
        const defaultPriority = priorityNames.find(p => p.toLowerCase() === 'medium') || priorityNames[0];
        setPriority(defaultPriority);
      } else {
        setPriority('');
      }

      const recurrenceNames = recurrencesData.map(r => r.name);
      setRecurrenceOptions(recurrenceNames);
      if (recurrenceNames.length > 0) {
        const defaultRecurrence = recurrenceNames.find(r => r.toLowerCase() === 'none') || recurrenceNames[0];
        setRecurrence(defaultRecurrence);
      } else {
        setRecurrence('');
      }

    } catch (err: any) {
      console.error("Error fetching task configuration options:", err);
      const errorMessage = err.message || "Could not load task configuration options.";
      setFetchConfigError(errorMessage);
      toast({ title: "Error Loading Task Options", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);


  useEffect(() => {
    if (pbClient) {
      fetchAndSetEmployees(pbClient);
      fetchTaskConfigOptions(pbClient);
    }
  }, [pbClient, fetchAndSetEmployees, fetchTaskConfigOptions]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachments(event.target.files);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in to create a task.", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Validation Error", description: "Task title is required.", variant: "destructive" });
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
     if (!recurrence) {
      toast({ title: "Validation Error", description: "Task recurrence is required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("status", status);
    formData.append("priority", priority);
    if (startDate) {
      formData.append("startDate", startDate.toISOString());
    }
    if (dueDate) {
      formData.append("dueDate", dueDate.toISOString());
    }
    formData.append("recurrence", recurrence);
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
      toast({ title: "Success", description: "New task created successfully!" });
      router.push("/tasks");
    } catch (err: any) {
      console.error("Failed to create task:", err);
      let detailedMessage = "Failed to create task. Please try again.";
      
      if (err?.data?.message) {
        detailedMessage = `Error: ${err.data.message}`;
      } else if (err?.data?.data) { // Check for field-specific errors
         const fieldErrors = Object.entries(err.data.data)
          .map(([key, val]: [string, any]) => `${key}: ${val.message}`)
          .join(" \n");
        if (fieldErrors) {
          detailedMessage = `Validation errors: ${fieldErrors}`;
        }
      } else if (err?.message) {
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

  const refetchConfigOptions = () => {
    if (pbClient) {
      fetchTaskConfigOptions(pbClient);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-semibold">Add New Task</h1>
        <Button variant="outline" asChild>
          <Link href="/tasks">Cancel</Link>
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Task Details</CardTitle>
          <CardDescription>Fill in the information for the new task.</CardDescription>
        </CardHeader>
        {!pbClient && (
          <CardContent>
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Initializing task creation form...</p>
            </div>
          </CardContent>
        )}
        {pbClient && (
        <CardContent>
          {fetchConfigError && (
            <div className="mb-4 p-4 border border-destructive/50 bg-destructive/10 text-destructive rounded-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Error loading task options</span>
              </div>
              <p className="text-sm mt-1">{fetchConfigError}</p>
              <Button onClick={refetchConfigOptions} variant="outline" size="sm" className="mt-2">
                Retry loading options
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="e.g., Calibrate pH meter" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Add any relevant details or instructions..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value: string) => setStatus(value)} disabled={isLoadingConfig || !!fetchConfigError}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder={isLoadingConfig ? "Loading statuses..." : "Select status"} />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={(value: string) => setPriority(value)} disabled={isLoadingConfig || !!fetchConfigError}>
                  <SelectTrigger id="priority">
                    <SelectValue placeholder={isLoadingConfig ? "Loading priorities..." : "Select priority"} />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="recurrence">Recurrence</Label>
                <Select value={recurrence} onValueChange={(value: string) => setRecurrence(value)} disabled={isLoadingConfig || !!fetchConfigError}>
                  <SelectTrigger id="recurrence">
                    <SelectValue placeholder={isLoadingConfig ? "Loading recurrences..." : "Select recurrence"} />
                  </SelectTrigger>
                  <SelectContent>
                    {recurrenceOptions.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="assignedTo">Assigned To</Label>
                <Select 
                  onValueChange={(value: string) => setAssignedToText(value === "__NONE__" ? undefined : value)} 
                  value={assignedToText || "__NONE__"}
                  disabled={isLoadingEmployees || !!fetchEmployeesError}
                >
                  <SelectTrigger id="assignedTo_text">
                    <SelectValue placeholder={isLoadingEmployees ? "Loading employees..." : (fetchEmployeesError ? "Error loading" : "Select employee (Optional)")} />
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
              <Button type="submit" disabled={isSubmitting || isLoadingEmployees || isLoadingConfig || !!fetchConfigError}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Task
              </Button>
            </div>
          </form>
        </CardContent>
        )}
      </Card>
    </div>
  );
}

