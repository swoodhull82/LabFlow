
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import type { Task, TaskStatus, TaskPriority, TaskRecurrence, Employee } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Filter, Loader2, AlertTriangle, CheckCircle2, Circle, CalendarIcon, Save } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { deleteTask, getTasks, updateTask } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import type PocketBase from "pocketbase";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { TASK_STATUSES, TASK_PRIORITIES, TASK_RECURRENCES } from "@/lib/constants";

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
    if ('status' in error && error.status === 0) {
      message = `Failed to load ${context}: Could not connect to the server. Please check your internet connection and try again.`;
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
      const collectionName = context.includes("employee") ? "employees" : "tasks";
      if (status === 404) message = `The ${collectionName} collection was not found (404). Original: ${message}`;
      else if (status === 403) message = `You do not have permission to manage ${collectionName} (403). Original: ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

const taskEditFormSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().optional(),
  status: z.string().min(1, "Status is required.") as z.ZodType<TaskStatus>,
  priority: z.string().min(1, "Priority is required.") as z.ZodType<TaskPriority>,
  startDate: z.date().optional(),
  dueDate: z.date().optional(),
  recurrence: z.string().min(1, "Recurrence is required.") as z.ZodType<TaskRecurrence>,
  assignedTo_text: z.string().optional(),
  // attachments are not handled in this form for simplicity
});
type TaskEditFormData = z.infer<typeof taskEditFormSchema>;


export default function TasksPage() {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [fetchEmployeesError, setFetchEmployeesError] = useState<string | null>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const form = useForm<TaskEditFormData>({
    resolver: zodResolver(taskEditFormSchema),
  });

  const fetchTasksCallback = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(false); 
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pb, { signal });
      setTasks(fetchedTasks);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

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
  }, [toast]);

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
      if (isAutocancel) {
         console.warn(`Fetch employees for task edit request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (err?.status === 0 && !isAutocancel) { // Check for network error
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
  }, [pbClient, fetchTasksCallback, fetchAndSetEmployees]);

  useEffect(() => {
    if (editingTask) {
      form.reset({
        title: editingTask.title,
        description: editingTask.description || "",
        status: editingTask.status,
        priority: editingTask.priority,
        startDate: editingTask.startDate ? new Date(editingTask.startDate) : undefined,
        dueDate: editingTask.dueDate ? new Date(editingTask.dueDate) : undefined,
        recurrence: editingTask.recurrence,
        assignedTo_text: editingTask.assignedTo_text || "",
      });
    }
  }, [editingTask, form]);


  const handleToggleTaskStatus = async (taskId: string, currentStatus: TaskStatus) => {
    if (!pbClient) {
      toast({ title: "Error", description: "Client not available.", variant: "destructive" });
      return;
    }

    const newStatus: TaskStatus = currentStatus === "Done" ? "To Do" : "Done";
    const optimisticUpdatedTasks = tasks.map(task => 
      task.id === taskId ? { ...task, status: newStatus } : task
    );
    setTasks(optimisticUpdatedTasks);

    try {
      const updatedTaskData = await updateTask(pbClient, taskId, { status: newStatus });
      setTasks(prevTasks => prevTasks.map(task => 
        task.id === taskId ? updatedTaskData : task
      ));
      toast({ title: "Success", description: `Task marked as ${newStatus}.` });
    } catch (err) {
      console.warn("Error updating task status:", err); 
      setTasks(tasks); 
      toast({ title: "Error", description: `Failed to update task status: ${getDetailedErrorMessage(err as any)}`, variant: "destructive" });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
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
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setIsEditDialogOpen(true);
  };

  const handleEditDialogClose = () => {
    setIsEditDialogOpen(false);
    setEditingTask(null);
    form.reset(); 
  };

  const onEditSubmit = async (data: TaskEditFormData) => {
    if (!editingTask || !pbClient || !user) {
      toast({ title: "Error", description: "Editing context, client or user not available.", variant: "destructive" });
      return;
    }
    setIsSubmittingEdit(true);

    const payload: Partial<Task> = {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      startDate: data.startDate,
      dueDate: data.dueDate,
      recurrence: data.recurrence,
      assignedTo_text: data.assignedTo_text === "__NONE__" || !data.assignedTo_text ? undefined : data.assignedTo_text,
      userId: user.id, // Ensure userId is maintained
    };
    
    try {
      const updatedRecord = await updateTask(pbClient, editingTask.id, payload);
      setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedRecord : t));
      toast({ title: "Success", description: "Task updated successfully." });
      handleEditDialogClose();
    } catch (err: any) {
      console.warn("Failed to update task:", err);
      toast({ title: "Error Updating Task", description: getDetailedErrorMessage(err), variant: "destructive" });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const refetchTasks = () => {
    if (pbClient) {
      const controller = new AbortController();
      fetchTasksCallback(pbClient, controller.signal); 
    }
  }

  const isLoadingInitialData = isLoading || isLoadingEmployees;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-semibold">Task Management</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Link href="/tasks/new" passHref>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Task
            </Button>
          </Link>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">All Tasks</CardTitle>
          <CardDescription>View, manage, and track all laboratory tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInitialData && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading tasks and employee data...</p>
            </div>
          )}
          {error && !isLoadingInitialData && (
            <div className="text-center py-10 text-destructive">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Tasks</p>
              <p className="text-sm">{error}</p>
              <Button onClick={refetchTasks} className="mt-6">Try Again</Button>
            </div>
          )}
          {!isLoadingInitialData && !error && tasks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <p>No tasks found. Get started by adding a new task!</p>
            </div>
          )}
          {!isLoadingInitialData && !error && tasks.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
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
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                    </TableCell>
                    <TableCell>{task.dueDate ? format(new Date(task.dueDate), "MMM dd, yyyy") : "-"}</TableCell>
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
              <DialogTitle className="font-headline">Edit Task: {editingTask.title}</DialogTitle>
              <DialogDescription>Make changes to the task details below.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Start Date (Optional)</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button
                                    variant={"outline"}
                                    className="w-full justify-start text-left font-normal"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="dueDate"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Due Date (Optional)</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button
                                    variant={"outline"}
                                    className="w-full justify-start text-left font-normal"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <FormField
                        control={form.control}
                        name="assignedTo_text"
                        render={({ field }) => (
                        <FormItem>
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
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={handleEditDialogClose} disabled={isSubmittingEdit}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingEdit || isLoadingEmployees}>
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


    
