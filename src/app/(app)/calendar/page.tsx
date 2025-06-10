
"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function CalendarPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());

  const fetchTasks = async () => {
    if (!pbClient) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pbClient);
      setAllTasks(fetchedTasks);
    } catch (err) {
      console.error("Error fetching tasks:", err);
      setError("Failed to load tasks for calendar.");
      toast({ title: "Error", description: "Failed to load tasks for calendar.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [pbClient]);

  const tasksForSelectedDate = useMemo(() => {
    if (!date) return [];
    return allTasks.filter(task => 
      task.dueDate && format(new Date(task.dueDate), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
  }, [date, allTasks]);

  const taskDates = useMemo(() => {
    return allTasks.map(task => task.dueDate ? new Date(task.dueDate) : null).filter(Boolean) as Date[];
  }, [allTasks]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Task Calendar</h1>
      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading calendar tasks...</p>
        </div>
      )}
      {error && !isLoading && (
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={fetchTasks} className="mt-4">Try Again</Button>
        </div>
      )}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-md">
            <CardContent className="p-0">
              <ShadcnCalendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                modifiers={{ taskDay: taskDates }}
                modifiersClassNames={{ taskDay: "bg-primary/20 rounded-full !text-primary-foreground" }}
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
      )}
    </div>
  );
}
