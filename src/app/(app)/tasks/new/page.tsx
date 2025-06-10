
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TASK_PRIORITIES, TASK_RECURRENCES, TASK_STATUSES } from "@/lib/constants";
import { CalendarIcon, Save, UploadCloud, Loader2 } from "lucide-react";
import { format } from "date-fns";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createTask } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import type { TaskPriority, TaskStatus, TaskRecurrence } from "@/lib/types";

// Mock employees for assignment - replace with actual data fetching if needed
const mockEmployees = [
  { id: "emp1", name: "Dr. Eleanor Vance" },
  { id: "emp2", name: "Marcus Chen" },
  { id: "emp3", name: "Aisha Khan" },
];

export default function NewTaskPage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To Do");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("None");
  const [assignedToText, setAssignedToText] = useState<string | undefined>();
  const [attachments, setAttachments] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      toast({ title: "Error", description: "Task title is required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("status", status);
    formData.append("priority", priority);
    if (dueDate) {
      formData.append("dueDate", dueDate.toISOString());
    }
    formData.append("recurrence", recurrence);
    if (assignedToText) {
      formData.append("assignedTo_text", assignedToText);
    }
    formData.append("userId", user.id); // Link task to current user

    if (attachments) {
      for (let i = 0; i < attachments.length; i++) {
        formData.append("attachments", attachments[i]);
      }
    }

    try {
      await createTask(pbClient, formData);
      toast({ title: "Success", description: "New task created successfully!" });
      router.push("/tasks");
    } catch (error) {
      console.error("Failed to create task:", error);
      toast({ title: "Error", description: "Failed to create task. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="e.g., Calibrate pH meter" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Add any relevant details or instructions..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value: TaskStatus) => setStatus(value)}>
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
                <Select value={priority} onValueChange={(value: TaskPriority) => setPriority(value)}>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <div>
                <Label htmlFor="recurrence">Recurrence</Label>
                <Select value={recurrence} onValueChange={(value: TaskRecurrence) => setRecurrence(value)}>
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
            </div>
            <div>
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Select onValueChange={(value: string) => setAssignedToText(value)} value={assignedToText}>
                <SelectTrigger id="assignedTo_text">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {mockEmployees.map(emp => (
                    <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={isSubmitting}>
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
