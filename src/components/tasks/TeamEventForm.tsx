
"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Trash2, Calendar, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createPersonalEvent, updatePersonalEvent, type PersonalEventUpdateData } from "@/services/personalEventService";
import { useState } from "react";
import { format, set, addDays, startOfWeek } from "date-fns";
import { PERSONAL_EVENT_TYPES, TASK_RECURRENCES } from "@/lib/constants";
import type { CalendarEvent, PersonalEventType, TaskRecurrence, Employee } from "@/lib/types";
import { cn } from "@/lib/utils";

const teamEventFormSchema = z.object({
  userId: z.string().min(1, { message: "An employee must be selected." }),
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  description: z.string().optional(),
  selectedDays: z.array(z.number()).min(1, { message: "Please select at least one day." }),
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

type TeamEventFormData = z.infer<typeof teamEventFormSchema>;

interface TeamEventFormProps {
  onEventUpserted: () => void;
  onDialogClose: () => void;
  onDelete?: (eventId: string) => void;
  eventToEdit?: CalendarEvent | null;
  employees: Employee[];
  weekToShow: Date;
}

const generateTimeSlots = () => {
    const slots = [];
    for (let i = 7; i <= 16; i++) {
        slots.push(`${String(i).padStart(2, '0')}:00`);
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

const weekdays = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
];

export function TeamEventForm({ onEventUpserted, onDialogClose, onDelete, eventToEdit, employees, weekToShow }: TeamEventFormProps) {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isEditMode = !!eventToEdit;

  const defaultStartTime = '09:00';
  const defaultEndTime = '17:00';

  const form = useForm<TeamEventFormData>({
    resolver: zodResolver(teamEventFormSchema),
    defaultValues: isEditMode && eventToEdit ? {
      userId: eventToEdit.ownerId || "",
      title: eventToEdit.title || "",
      description: eventToEdit.description || "",
      eventType: eventToEdit.eventType || "Available",
      selectedDays: [new Date(eventToEdit.startDate).getDay()], // getDay() is 1 for Mon, 2 for Tue...
      isAllDay: eventToEdit.isAllDay || false,
      startTime: !eventToEdit.isAllDay ? format(new Date(eventToEdit.startDate), 'HH:mm') : defaultStartTime,
      endTime: !eventToEdit.isAllDay ? format(new Date(eventToEdit.endDate), 'HH:mm') : defaultEndTime,
      recurrence: eventToEdit.recurrence || "None",
    } : {
      userId: "",
      title: "",
      description: "",
      eventType: "Available",
      selectedDays: [],
      isAllDay: false,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      recurrence: "None"
    },
  });
  
  const isAllDay = form.watch("isAllDay");

  async function onSubmit(data: TeamEventFormData) {
    if (!pbClient) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      if (isEditMode && eventToEdit) {
        // Handle editing a single event
        let startDate, endDate;
        const eventDate = new Date(eventToEdit.startDate);
        if (data.isAllDay) {
          startDate = set(eventDate, { hours: 7, minutes: 0, seconds: 0 });
          endDate = set(eventDate, { hours: 16, minutes: 0, seconds: 0 });
        } else {
          const [startHour, startMinute] = data.startTime!.split(':').map(Number);
          const [endHour, endMinute] = data.endTime!.split(':').map(Number);
          startDate = set(eventDate, { hours: startHour, minutes: startMinute, seconds: 0 });
          endDate = set(eventDate, { hours: endHour, minutes: endMinute, seconds: 0 });
        }
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
        toast({ title: "Success", description: "Event updated." });

      } else {
        // Handle creating multiple events for selected days
        const weekStartDate = startOfWeek(weekToShow, { weekStartsOn: 1 });
        const creationPromises = data.selectedDays.map(dayIndex => {
            const eventDate = addDays(weekStartDate, dayIndex - 1);
            let startDate, endDate;
            if (data.isAllDay) {
                startDate = set(eventDate, { hours: 7, minutes: 0, seconds: 0 });
                endDate = set(eventDate, { hours: 16, minutes: 0, seconds: 0 });
            } else {
                const [startHour, startMinute] = data.startTime!.split(':').map(Number);
                const [endHour, endMinute] = data.endTime!.split(':').map(Number);
                startDate = set(eventDate, { hours: startHour, minutes: startMinute, seconds: 0 });
                endDate = set(eventDate, { hours: endHour, minutes: endMinute, seconds: 0 });
            }
            const eventPayload = {
              userId: data.userId,
              title: data.title,
              description: data.description,
              startDate,
              endDate,
              isAllDay: data.isAllDay,
              eventType: data.eventType,
              recurrence: data.recurrence,
            };
            return createPersonalEvent(pbClient, eventPayload);
        });

        await Promise.all(creationPromises);
        toast({ title: "Success", description: `Events created for ${data.selectedDays.length} day(s).` });
      }
      
      onEventUpserted();
      onDialogClose();

    } catch (err: any) {
      toast({
        title: `Error ${isEditMode ? 'Updating' : 'Creating'} Event`,
        description: err.data?.message || err.message || "An unexpected error occurred. Please check PocketBase permissions.",
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
            name="userId"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Employee</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={isEditMode}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select an employee" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    {employees.filter(emp => emp.userId).map(employee => (
                        <SelectItem key={employee.userId} value={employee.userId!}>{employee.name}</SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g., On-site Training" {...field} />
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
          name="selectedDays"
          render={() => (
            <FormItem>
              <FormLabel>Days</FormLabel>
               <p className="text-sm text-muted-foreground">Select which days this event should occur on for the week of {format(weekToShow, 'MMM do')}.</p>
              <div className="flex items-center space-x-4 pt-2">
                {weekdays.map(day => (
                  <FormField
                    key={day.id}
                    control={form.control}
                    name="selectedDays"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={day.id}
                          className="flex flex-row items-start space-x-2 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(day.id)}
                              onCheckedChange={(checked) => {
                                const currentDays = field.value || [];
                                return checked
                                  ? field.onChange([...currentDays, day.id])
                                  : field.onChange(
                                      currentDays.filter(
                                        (value) => value !== day.id
                                      )
                                    )
                              }}
                              disabled={isEditMode}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {day.label}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
              </div>
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
            {isEditMode && onDelete && eventToEdit && (
              <Button type="button" variant="destructive" onClick={() => onDelete(eventToEdit.id)} disabled={isSubmitting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button type="button" variant="ghost" onClick={onDialogClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditMode ? "Save Changes" : "Save Event(s)"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
