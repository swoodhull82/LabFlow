
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button"; // Renamed to avoid conflict if any native button is used
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import type { Task } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import GanttChart from "@/components/gantt/GanttChart";
import type PocketBase from "pocketbase";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching tasks for the timeline.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load timeline data: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
        message = error.originalError.message;
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }

    if ('status' in error && error.status !== 0) {
      const status = error.status;
      if (status === 404) message = `The 'tasks' collection was not found (404). ${message}`;
      else if (status === 403) message = `You do not have permission to view tasks (403). ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

export default function TimelinePage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimelineTasks = useCallback(async (pb: PocketBase | null) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    let ignore = false;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pb);
      if (!ignore) {
        setTasks(fetchedTasks.filter(task => task.startDate && task.dueDate));
      }
    } catch (err: any) {
      if (!ignore) {
        const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
        const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;
        
        if (isAutocancel) {
          console.warn(`Timeline tasks fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
        } else if (isNetworkErrorNotAutocancel) {
          const detailedError = getDetailedErrorMessage(err);
          setError(detailedError);
          toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
          console.warn("Timeline tasks fetch (network error):", detailedError, err);
        } else {
          console.warn("Error fetching tasks for timeline (after retries):", err); 
          const detailedError = getDetailedErrorMessage(err);
          setError(detailedError);
          toast({ title: "Error Loading Timeline Data", description: detailedError, variant: "destructive" });
        }
      }
    } finally {
      if (!ignore) {
        setIsLoading(false);
      }
    }
    return () => {
      ignore = true;
    };
  }, [toast]);

  useEffect(() => {
    if (pbClient) {
      const cleanup = fetchTimelineTasks(pbClient);
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      };
    } else {
       setIsLoading(true);
    }
  }, [pbClient, fetchTimelineTasks]);

  const refetchTasks = () => {
    if (pbClient) {
      fetchTimelineTasks(pbClient);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Timeline / Gantt Chart</h1>
      <p className="text-muted-foreground">
        Visualize task schedules and progress. 
        <span className="text-xs block mt-1">Note: Advanced features like drag-and-drop rescheduling and dependency linking are planned for future updates.</span>
      </p>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Project Schedule</CardTitle>
          <CardDescription>Overview of task timelines.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          {isLoading && (
            <div className="flex justify-center items-center py-10 min-h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading timeline data...</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-center py-10 min-h-[300px]">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Timeline Data</p>
              <p className="text-sm">{error}</p>
              <ShadcnButton 
                onClick={refetchTasks} 
                className="mt-6"
              >
                Try Again
              </ShadcnButton>
            </div>
          )}
          {!isLoading && !error && tasks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground min-h-[300px]">
              <p>No tasks with both start and due dates found to display on the timeline.</p>
              <p className="text-xs mt-1">Ensure tasks have valid start and due dates assigned.</p>
            </div>
          )}
          {!isLoading && !error && tasks.length > 0 && (
            <GanttChart tasks={tasks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
