
"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CalendarIcon, Loader2, Save, Trash2, Users, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { createTeamEvent, updateTeamEvent } from "@/services/teamEventService";
import { useState } from "react";
import { format, addHours, set, getHours } from "date-fns";
import type { CalendarEvent, Employee } from "@/lib/types";
import { cn } from "@/lib/utils";

const teamEventFormSchema = z.object({
  title: z.string().min(2, { message: "Title must be at least 2 characters." }),
  description: z.string().optional(),
  eventDate: z.date({ required_error: "An event date is required." }),
  isAllDay: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  color: z.string().optional(),
  assignedTo: z.array(z.string()).optional(),
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
  employees: Employee[];
  onDataChanged: () => void;
  onDialogClose: () => void;
  onDelete?: (eventId: string) => void;
  defaultDate?: Date;
  eventToEdit?: CalendarEvent | null;
}

const generateTimeSlots = () => {
    const slots = [];
    for (let i = 7; i <= 16; i++) {
        slots.push(`${String(i).padStart(2, '0')}:00`);
        if (i < 16) slots.push(`${String(i).padStart(2, '0')}:30`);
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

export function TeamEventForm({ employees, onDataChanged, onDialogClose, onDelete, defaultDate, eventToEdit }: TeamEventFormProps) {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isEditMode = !!eventToEdit;

  const defaultHour = defaultDate ? getHours(defaultDate) : 9;
  const defaultStartDateWithHour = set(defaultDate || new Date(), { hours: defaultHour, minutes: 0, seconds: 0 });
  const defaultStartTime = format(defaultStartDateWithHour, 'HH:mm');
  const defaultEndTime = format(addHours(defaultStartDateWithHour, 1), 'HH:mm');
  
  const form = useForm<TeamEventFormData>({
    resolver: zodResolver(teamEventFormSchema),
    defaultValues: {
      title: eventToEdit?.title || "",
      description: eventToEdit?.description || "",
      eventDate: eventToEdit ? new Date(eventToEdit.startDate) : (defaultDate || new Date()),
      isAllDay: eventToEdit?.isAllDay || false,
      startTime: eventToEdit && !eventToEdit.isAllDay ? format(new Date(eventToEdit.startDate), 'HH:mm') : defaultStartTime,
      endTime: eventToEdit && !eventToEdit.isAllDay ? format(new Date(eventToEdit.endDate), 'HH:mm') : defaultEndTime,
      color: eventToEdit?.color || "#3b82f6",
      assignedTo: eventToEdit?.assignedTo || [],
    },
  });
  
  const isAllDay = form.watch("isAllDay");

  async function onSubmit(data: TeamEventFormData) {
    if (!pbClient || !user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    let startDate, endDate;
    if (data.isAllDay) {
        startDate = set(data.eventDate, { hours: 7, minutes: 0, seconds: 0 });
        endDate = set(data.eventDate, { hours: 16, minutes: 0, seconds: 0 });
    } else {
        const [startHour, startMinute] = data.startTime!.split(':').map(Number);
        const [endHour, endMinute] = data.endTime!.split(':').map(Number);
        startDate = set(data.eventDate, { hours: startHour, minutes: startMinute, seconds: 0 });
        endDate = set(data.eventDate, { hours: endHour, minutes: endMinute, seconds: 0 });
    }

    const eventPayload = {
        title: data.title,
        description: data.description,
        startDate,
        endDate,
        isAllDay: data.isAllDay,
        color: data.color,
        assignedTo: data.assignedTo,
        createdBy: user.id,
    };

    try {
      if (isEditMode) {
        await updateTeamEvent(pbClient, eventToEdit.id, eventPayload);
        toast({ title: "Success", description: "Team event updated." });
      } else {
        await createTeamEvent(pbClient, eventPayload);
        toast({ title: "Success", description: "Team event added." });
      }
      onDataChanged();
      onDialogClose();
    } catch (err: any) {
      toast({
        title: `Error ${isEditMode ? 'Updating' : 'Creating'} Event`,
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField name="title" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Event Title</FormLabel><FormControl><Input placeholder="e.g., Weekly Sync" {...field} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField name="description" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Add more details..." {...field} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField name="eventDate" control={form.control} render={({ field }) => (
            <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                <Popover><PopoverTrigger asChild><FormControl>
                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                </FormControl></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/></PopoverContent></Popover>
                <FormMessage />
            </FormItem>
        )}/>
        <FormField name="isAllDay" control={form.control} render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div className="space-y-1 leading-none"><FormLabel className="cursor-pointer">All-day event</FormLabel></div>
            </FormItem>
        )}/>
        {!isAllDay && (
            <div className="grid grid-cols-2 gap-4">
                <FormField name="startTime" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Start Time</FormLabel><Controller control={form.control} name="startTime" render={({field: controllerField}) => (
                        <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start">{controllerField.value ? formatTimeSlot(controllerField.value) : "Select"}</Button></PopoverTrigger>
                        <PopoverContent className="w-40 p-0"><Command><CommandList>{timeSlots.map(slot => (<CommandItem key={`start-${slot}`} onSelect={() => controllerField.onChange(slot)}>{formatTimeSlot(slot)}</CommandItem>))}</CommandList></Command></PopoverContent></Popover>
                    )}/><FormMessage /></FormItem>
                )}/>
                <FormField name="endTime" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>End Time</FormLabel><Controller control={form.control} name="endTime" render={({field: controllerField}) => (
                        <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start">{controllerField.value ? formatTimeSlot(controllerField.value) : "Select"}</Button></PopoverTrigger>
                        <PopoverContent className="w-40 p-0"><Command><CommandList>{timeSlots.map(slot => (<CommandItem key={`end-${slot}`} onSelect={() => controllerField.onChange(slot)}>{formatTimeSlot(slot)}</CommandItem>))}</CommandList></Command></PopoverContent></Popover>
                    )}/><FormMessage /></FormItem>
                )}/>
            </div>
        )}
        <FormField name="assignedTo" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Assign To</FormLabel>
                <Popover><PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                        <Users className="mr-2 h-4 w-4" />
                        {field.value?.length ? `${field.value.length} selected` : 'Select employees...'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width)] p-0">
                    <Command><CommandInput placeholder="Search employees..."/><CommandList><CommandEmpty>No results found.</CommandEmpty><CommandGroup>
                        {employees.map((employee) => (
                            <CommandItem key={employee.id} onSelect={() => {
                                const newValue = field.value?.includes(employee.id) ? field.value.filter(id => id !== employee.id) : [...(field.value || []), employee.id];
                                field.onChange(newValue);
                            }}>
                                <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", field.value?.includes(employee.id) ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible')}><Check className="h-4 w-4" /></div>
                                <span>{employee.name}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup></CommandList></Command>
                </PopoverContent></Popover>
            <FormMessage /></FormItem>
        )}/>
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
