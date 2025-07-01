
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createTask } from "@/services/taskService";
import { useState } from "react";
import { format } from "date-fns";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const quickTaskFormSchema = z.object({
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  description: z.string().optional(),
  dueDate: z.date({ required_error: "A due date is required." }),
  priority: z.string().min(1, { message: "Priority is required." }) as z.ZodType<TaskPriority>,
});

type QuickTaskFormData = z.infer<typeof quickTaskFormSchema>;

interface QuickTaskFormProps {
  onTaskCreated: () => void;
  onDialogClose: () => void;
  defaultDate?: Date;
}

export function QuickTaskForm({ onTaskCreated, onDialogClose, defaultDate }: QuickTaskFormProps) {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<QuickTaskFormData>({
    resolver: zodResolver(quickTaskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "Medium",
      dueDate: defaultDate,
    },
  });

  async function onSubmit(data: QuickTaskFormData) {
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in to create a task.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("task_type", "oDOC"); // Using a generic, non-complex type for personal tasks
    formData.append("status", "To Do" as TaskStatus);
    formData.append("priority", data.priority);
    formData.append("recurrence", "None");
    formData.append("userId", user.id);

    if (data.description) {
      formData.append("description", data.description);
    }
    if (data.dueDate) {
      // For a quick personal task, let's make start and end date the same by default
      formData.append("startDate", data.dueDate.toISOString());
      formData.append("dueDate", data.dueDate.toISOString());
    }
    if (user.name) {
      formData.append("assignedTo_text", user.name);
    }

    try {
      await createTask(pbClient, formData);
      toast({ title: "Success", description: "Personal task added to your calendar." });
      onTaskCreated();
      onDialogClose();
    } catch (err: any) {
      let detailedMessage = "Failed to create task. Please try again.";
      if (err.data?.message) {
        detailedMessage = err.data.message;
      } else if (err.message) {
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
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Review quarterly report" {...field} />
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
                <Textarea placeholder="Add more details..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>Date & Time</FormLabel>
                <Popover>
                    <PopoverTrigger asChild>
                    <FormControl>
                        <Button
                        variant={"outline"}
                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        >
                        {field.value ? format(field.value, "PPP, h:mm a") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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
            name="priority"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="ghost" onClick={onDialogClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Task
          </Button>
        </div>
      </form>
    </Form>
  );
}
