"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Filter } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

const mockTasks: Task[] = [
  { id: "1", title: "Conduct Experiment X101", description: "Detailed protocol attached.", status: "In Progress", priority: "High", dueDate: new Date(2024, 6, 25), recurrence: "None", createdAt: new Date(2024, 6, 1), updatedAt: new Date(2024, 6, 10), assignedTo: "Dr. Smith" },
  { id: "2", title: "Analyze Sample Batch #42", description: "Cross-reference with previous batch.", status: "To Do", priority: "Medium", dueDate: new Date(2024, 7, 1), recurrence: "None", createdAt: new Date(2024, 6, 15), updatedAt: new Date(2024, 6, 15), assignedTo: "Jane Doe" },
  { id: "3", title: "Prepare Weekly Report", description: "Include all findings from this week.", status: "To Do", priority: "Low", dueDate: new Date(2024, 6, 28), recurrence: "Weekly", createdAt: new Date(2024, 6, 1), updatedAt: new Date(2024, 6, 1) },
  { id: "4", title: "Calibrate Spectrometer", description: "Follow SOP-CAL-003.", status: "Done", priority: "High", dueDate: new Date(2024, 6, 20), recurrence: "None", createdAt: new Date(2024, 6, 18), updatedAt: new Date(2024, 6, 20), assignedTo: "Tech Team" },
  { id: "5", title: "Order New Reagents", description: "List of reagents in shared drive.", status: "Overdue", priority: "Urgent", dueDate: new Date(2024, 6, 15), recurrence: "None", createdAt: new Date(2024, 6, 5), updatedAt: new Date(2024, 6, 5), assignedTo: "Admin" },
];

const getPriorityBadgeVariant = (priority: TaskPriority) => {
  switch (priority) {
    case "Urgent": return "destructive";
    case "High": return "destructive"; // Or a specific "warning" variant if available/customized
    case "Medium": return "secondary";
    case "Low": return "outline";
    default: return "default";
  }
};

const getStatusBadgeVariant = (status: TaskStatus) => {
  switch (status) {
    case "Done": return "default"; // Default is often green or primary
    case "In Progress": return "secondary";
    case "Overdue": return "destructive";
    case "Blocked": return "destructive"; // Or specific "warning"
    default: return "outline";
  }
};


export default function TasksPage() {
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
              {mockTasks.map((task) => (
                <TableRow key={task.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                  </TableCell>
                  <TableCell>{task.dueDate ? format(task.dueDate, "MMM dd, yyyy") : "-"}</TableCell>
                  <TableCell>{task.assignedTo || "-"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Link href={`/tasks/${task.id}/edit`} className="flex items-center w-full">
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
