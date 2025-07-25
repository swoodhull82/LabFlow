
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
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Loader2, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createPersonalEvent, updatePersonalEvent, type PersonalEventUpdateData } from "@/services/personalEventService";
import { useState } from "react";
import { format, addHours, set, getHours } from "date-fns";
import { PERSONAL_EVENT_TYPES, TASK_RECURRENCES } from "@/lib/constants";
import type { CalendarEvent, PersonalEventType, TaskRecurrence } from "@/lib/types";
import { cn } from "@/lib/utils";

const quickTaskFormSchema = z.object({
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  description: z.string().optional(),
  eventDate: z.date({ required_error: "An event date is required." }),
  isAllDay: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventType: z.string().default('Available') as z.ZodType<PersonalEventType>,
  recurrence: z.string().default('None') as z.ZodType<TaskRecurrence>,
}).superRefine((data, ctx) => {
    if (!data.isAllDay) {
        if (!data.startTime) {
            ctx.addIssue({ code: 'custom', message: 'Start time is required for timed events.', path: ['startTime'] });
        }
        if (!data.endTime) {
            ctx.addIssue({ code: 'custom', message: 'End time is required for timed events.', path: ['endTime'] });
        }
        if (data.startTime && data.endTime && data.endTime <= data.startTime) {
            ctx.addIssue({ code: 'custom', message: 'End time must be after start time.', path: ['endTime'] });
        }
    }
});

type QuickTaskFormData = z.infer<typeof quickTaskFormSchema>;

interface QuickTaskFormProps {
  onTaskCreated: () => void;
  onDialogClose: () => void;
  onDelete?: (eventId: string) => void;
  defaultDate?: Date;
  eventToEdit?: CalendarEvent;
}

const generateTimeSlots = () => {
    const slots = [];
    // From 7 AM (7) to 4 PM (16)
    for (let i = 7; i <= 16; i++) {
        slots.push(`${String(i).padStart(2, '0')}:00`);
        // Add the :30 slot for all hours except the last one (4 PM)
        if (i < 16) {
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

export function QuickTaskForm({ onTaskCreated, onDialogClose, onDelete, defaultDate, eventToEdit }: QuickTaskFormProps) {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isEditMode = !!eventToEdit;

  const defaultHour = defaultDate ? getHours(defaultDate) : 9; // 9 AM
  const defaultStartDateWithHour = set(defaultDate || new Date(), { hours: defaultHour, minutes: 0, seconds: 0, milliseconds: 0 });
  const defaultStartTime = format(defaultStartDateWithHour, 'HH:mm');
  const defaultEndTime = format(addHours(defaultStartDateWithHour, 1), 'HH:mm');
  
  const form = useForm<QuickTaskFormData>({
    resolver: zodResolver(quickTaskFormSchema),
    defaultValues: {
      title: eventToEdit?.title || "",
      description: eventToEdit?.description || "",
      eventType: eventToEdit?.eventType || "Available",
      eventDate: eventToEdit ? new Date(eventToEdit.startDate) : defaultDate,
      isAllDay: eventToEdit?.isAllDay || false,
      startTime: eventToEdit && !eventToEdit.isAllDay ? format(new Date(eventToEdit.startDate), 'HH:mm') : defaultStartTime,
      endTime: eventToEdit && !eventToEdit.isAllDay ? format(new Date(eventToEdit.endDate), 'HH:mm') : defaultEndTime,
      recurrence: eventToEdit?.recurrence || "None",
    },
  });
  
  const isAllDay = form.watch("isAllDay");

  async function onSubmit(data: QuickTaskFormData) {
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    let startDate, endDate;

    if (data.isAllDay) {
        // Set to span the visible calendar hours (7 AM to 4 PM)
        startDate = set(data.eventDate, { hours: 7, minutes: 0, seconds: 0 });
        endDate = set(data.eventDate, { hours: 16, minutes: 0, seconds: 0 });
    } else {
        const [startHour, startMinute] = data.startTime!.split(':').map(Number);
        const [endHour, endMinute] = data.endTime!.split(':').map(Number);

        startDate = set(data.eventDate, { hours: startHour, minutes: startMinute, seconds: 0 });
        endDate = set(data.eventDate, { hours: endHour, minutes: endMinute, seconds: 0 });
    }

    try {
      if (isEditMode) {
        const eventPayload: PersonalEventUpdateData = {
          title: data.title,
          description: data.description,
          startDate,
          endDate,
          isAllDay: data.isAllDay,
          eventType: data.eventType,
          recurrence: data.recurrence,
        };
        await updatePersonalEvent(pbClient, eventToEdit.id, eventPayload);
        toast({ title: "Success", description: "Personal event updated." });
      } else {
        const eventPayload = {
          title: data.title,
          description: data.description,
          startDate,
          endDate,
          userId: user.id,
          isAllDay: data.isAllDay,
          eventType: data.eventType,
          recurrence: data.recurrence,
        };
        await createPersonalEvent(pbClient, eventPayload);
        toast({ title: "Success", description: "Personal event added to your calendar." });
      }
      onTaskCreated();
      onDialogClose();
    } catch (err: any) {
      toast({
        title: `Error ${isEditMode ? 'Updating' : 'Creating'} Event`,
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
        <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Show As</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    {PERSONAL_EVENT_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
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
            name="isAllDay"
            render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                <FormControl>
                    <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    />
                </FormControl>
                <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">
                      All-day event
                    </FormLabel>
                </div>
                </FormItem>
            )}
        />
        {!isAllDay && (
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
        )}

        <div className="flex justify-between items-center pt-4">
          <div>
            {isEditMode && onDelete && (
              <Button type="button" variant="destructive" onClick={() => onDelete(eventToEdit.id)} disabled={isSubmitting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button type="button" variant="ghost" onClick={onDialogClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditMode ? "Save Changes" : "Save Event"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
