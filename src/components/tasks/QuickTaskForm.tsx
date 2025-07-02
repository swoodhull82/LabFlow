
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
import { createPersonalEvent } from "@/services/personalEventService";
import { useState } from "react";
import { format, addHours, set, getHours } from "date-fns";
import { TASK_PRIORITIES } from "@/lib/constants";
import type { TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

const quickTaskFormSchema = z.object({
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  description: z.string().optional(),
  eventDate: z.date({ required_error: "An event date is required." }),
  startTime: z.string({ required_error: "Start time is required."}),
  endTime: z.string({ required_error: "End time is required."}),
  priority: z.string().min(1, { message: "Priority is required." }) as z.ZodType<TaskPriority>,
}).refine(data => {
    if (!data.startTime || !data.endTime) return true; // Let required check handle it
    return data.endTime > data.startTime;
}, {
    message: "End time must be after start time.",
    path: ["endTime"],
});

type QuickTaskFormData = z.infer<typeof quickTaskFormSchema>;

interface QuickTaskFormProps {
  onTaskCreated: () => void;
  onDialogClose: () => void;
  defaultDate?: Date;
}

const generateTimeSlots = () => {
    const slots = [];
    // From 6 AM (6) to 5 PM (17)
    for (let i = 6; i <= 17; i++) {
        slots.push(`${String(i).padStart(2, '0')}:00`);
        // Add the :30 slot for all hours except 5 PM
        if (i < 17) {
            slots.push(`${String(i).padStart(2, '0')}:30`);
        }
    }
    return slots;
};

const formatTimeSlot = (slot: string) => {
    const [hour, minute] = slot.split(':').map(Number);
    const date = new Date();
    date.setHours(hour, minute);
    return format(date, "h:mm a");
};

const timeSlots = generateTimeSlots();

export function QuickTaskForm({ onTaskCreated, onDialogClose, defaultDate }: QuickTaskFormProps) {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const defaultHour = defaultDate ? getHours(defaultDate) : 9; // 9 AM
  const defaultStartDateWithHour = set(defaultDate || new Date(), { hours: defaultHour, minutes: 0, seconds: 0, milliseconds: 0 });
  const defaultStartTime = format(defaultStartDateWithHour, 'HH:mm');
  const defaultEndTime = format(addHours(defaultStartDateWithHour, 1), 'HH:mm');
  
  const form = useForm<QuickTaskFormData>({
    resolver: zodResolver(quickTaskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "Medium",
      eventDate: defaultDate,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
    },
  });

  async function onSubmit(data: QuickTaskFormData) {
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in to create an event.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const [startHour, startMinute] = data.startTime.split(':').map(Number);
    const [endHour, endMinute] = data.endTime.split(':').map(Number);

    const startDate = set(data.eventDate, { hours: startHour, minutes: startMinute });
    const endDate = set(data.eventDate, { hours: endHour, minutes: endMinute });

    const eventPayload = {
      title: data.title,
      description: data.description,
      startDate,
      endDate,
      priority: data.priority,
      userId: user.id,
    };

    try {
      await createPersonalEvent(pbClient, eventPayload);
      toast({ title: "Success", description: "Personal event added to your calendar." });
      onTaskCreated();
      onDialogClose();
    } catch (err: any) {
      toast({
        title: "Error Creating Event",
        description: err.message || "An unexpected error occurred. Please try again.",
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
              <FormLabel>Event Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Team sync meeting" {...field} />
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
          <FormField
            control={form.control}
            name="eventDate"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
        </div>
        <div className="grid grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select start time" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {timeSlots.map(slot => (
                                    <SelectItem key={`start-${slot}`} value={slot}>{formatTimeSlot(slot)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select end time" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {timeSlots.map(slot => (
                                    <SelectItem key={`end-${slot}`} value={slot}>{formatTimeSlot(slot)}</SelectItem>
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
            Save Event
          </Button>
        </div>
      </form>
    </Form>
  );
}
