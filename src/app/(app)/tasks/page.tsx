
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Task, TaskStatus } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Filter, Loader2, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { deleteTask, getTasks, updateTask } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import type PocketBase from "pocketbase";

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

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while managing tasks.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load tasks: Could not connect to the server. Please check your internet connection and try again.";
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
      if (status === 404) message = `The tasks collection was not found (404). Original: ${message}`;
      else if (status === 403) message = `You do not have permission to manage tasks (403). Original: ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};


export default function TasksPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasksCallback = useCallback(async (pb: PocketBase | null) => {
    if (!pb) {
      setIsLoading(false); 
      return;
    }
    let ignore = false;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pb);
      if (!ignore) {
        setTasks(fetchedTasks);
      }
    } catch (err: any) {
      if (!ignore) {
        const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
        const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;
        
        if (isAutocancel) {
          console.warn(`Tasks fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
        } else if (isNetworkErrorNotAutocancel) {
          const detailedError = getDetailedErrorMessage(err);
          setError(detailedError);
          toast({ title: "Error Loading Tasks", description: detailedError, variant: "destructive" });
          console.warn("Tasks fetch (network error):", detailedError, err);
        } else {
          console.warn("Error fetching tasks (after retries):", err); 
          const detailedError = getDetailedErrorMessage(err);
          setError(detailedError);
          toast({ title: "Error Loading Tasks", description: detailedError, variant: "destructive" });
        }
      }
    } finally {
      if (!ignore) {
        setIsLoading(false);
      }
    }
    return () => {
      ignore = true;
    };
  }, [toast]);

  useEffect(() => {
    if (pbClient) {
      const cleanup = fetchTasksCallback(pbClient);
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      };
    } else {
      setIsLoading(true); 
    }
  }, [pbClient, fetchTasksCallback]);

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
      console.error("Error updating task status:", err); 
      setTasks(tasks); 
      toast({ title: "Error", description: `Failed to update task status: ${getDetailedErrorMessage(err)}`, variant: "destructive" });
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
      console.error("Error deleting task:", err); 
      setTasks(originalTasks);
      toast({ title: "Error", description: getDetailedErrorMessage(err), variant: "destructive" });
    }
  };

  const refetchTasks = () => {
    if (pbClient) {
      fetchTasksCallback(pbClient);
    }
  }

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
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading tasks...</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-center py-10 text-destructive">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Tasks</p>
              <p className="text-sm">{error}</p>
              <Button onClick={refetchTasks} className="mt-6">Try Again</Button>
            </div>
          )}
          {!isLoading && !error && tasks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <p>No tasks found. Get started by adding a new task!</p>
            </div>
          )}
          {!isLoading && !error && tasks.length > 0 && (
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
                          <DropdownMenuItem asChild>
                            <Link href={`/tasks/${task.id}/edit`} className="flex items-center w-full cursor-not-allowed opacity-50">
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </Link>
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
    </div>
  );
}
