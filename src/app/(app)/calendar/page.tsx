"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { addDays, format } from "date-fns";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const mockTasks: Task[] = [
  { id: "1", title: "Experiment A Setup", status: "To Do", priority: "High", dueDate: new Date(), recurrence: "None", createdAt: new Date(), updatedAt: new Date() },
  { id: "2", title: "Data Analysis", status: "In Progress", priority: "Medium", dueDate: addDays(new Date(), 2), recurrence: "None", createdAt: new Date(), updatedAt: new Date() },
  { id: "3", title: "Report Writing", status: "To Do", priority: "High", dueDate: addDays(new Date(), 5), recurrence: "None", createdAt: new Date(), updatedAt: new Date() },
  { id: "4", title: "Equipment Maintenance", status: "Done", priority: "Low", dueDate: addDays(new Date(), -3), recurrence: "None", createdAt: new Date(), updatedAt: new Date() },
  { id: "5", title: "Reagent Inventory Check", status: "To Do", priority: "Medium", dueDate: new Date(), recurrence: "None", createdAt: new Date(), updatedAt: new Date() },
];


export default function CalendarPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  const tasksForSelectedDate = useMemo(() => {
    if (!date) return [];
    return mockTasks.filter(task => 
      task.dueDate && format(task.dueDate, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
  }, [date]);

  const taskDates = useMemo(() => {
    return mockTasks.map(task => task.dueDate).filter(Boolean) as Date[];
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Task Calendar</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md">
          <CardContent className="p-0">
            <ShadcnCalendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md"
              modifiers={{ taskDay: taskDates }}
              modifiersClassNames={{ taskDay: "bg-primary/20 rounded-full" }}
            />
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline">
              Tasks for {date ? format(date, "PPP") : "selected date"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksForSelectedDate.length > 0 ? (
              <ul className="space-y-3">
                {tasksForSelectedDate.map(task => (
                  <li key={task.id} className="p-3 rounded-md border hover:bg-muted transition-colors">
                    <h3 className="font-semibold">{task.title}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant={task.priority === "High" || task.priority === "Urgent" ? "destructive" : "secondary"}>
                        {task.priority}
                      </Badge>
                      <Badge variant="outline">{task.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No tasks scheduled for this day.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
