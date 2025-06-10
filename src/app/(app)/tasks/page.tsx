
"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Filter, Loader2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { deleteTask, getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";

const getPriorityBadgeVariant = (priority?: TaskPriority) => {
  if (!priority) return "default";
  switch (priority) {
    case "Urgent": return "destructive";
    case "High": return "destructive";
    case "Medium": return "secondary";
    case "Low": return "outline";
    default: return "default";
  }
};

const getStatusBadgeVariant = (status?: TaskStatus) => {
  if (!status) return "default";
  switch (status) {
    case "Done": return "default";
    case "In Progress": return "secondary";
    case "Overdue": return "destructive";
    case "Blocked": return "destructive";
    default: return "outline";
  }
};

export default function TasksPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = async () => {
    if (!pbClient) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pbClient);
      setTasks(fetchedTasks);
    } catch (err) {
      console.error("Error fetching tasks:", err);
      setError("Failed to load tasks. Please try again.");
      toast({ title: "Error", description: "Failed to load tasks.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [pbClient]);

  const handleDeleteTask = async (taskId: string) => {
    if (!pbClient) return;
    try {
      await deleteTask(pbClient, taskId);
      toast({ title: "Success", description: "Task deleted successfully." });
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    } catch (err) {
      console.error("Error deleting task:", err);
      toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" });
    }
  };

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
              <p>{error}</p>
              <Button onClick={fetchTasks} className="mt-4">Try Again</Button>
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
                          <DropdownMenuItem asChild>
                             {/* TODO: Implement Edit Task Page: /tasks/[id]/edit */}
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
