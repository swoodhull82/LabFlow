
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getTasks, updateTask } from '@/services/taskService';
import type { Task, TaskStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { KanbanBoard } from '@/components/ui/kanban/board';
import type { Column } from '@/components/ui/kanban/board';
import type { Active, Over } from '@dnd-kit/core';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const initialColumns: Column[] = [
  { id: 'To Do', title: 'To Do' },
  { id: 'In Progress', title: 'In Progress' },
  { id: 'Blocked', title: 'Blocked' },
  { id: 'Overdue', title: 'Overdue' },
  { id: 'Done', title: 'Done' },
];

export default function KanbanPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKanbanData = useCallback(async () => {
    if (!pbClient) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks(pbClient, {
        filter: 'task_type != "VALIDATION_PROJECT" && task_type != "VALIDATION_STEP"',
      });
      setTasks(fetchedTasks);
    } catch (err: any) {
      const detailedError = `Failed to load tasks for Kanban board: ${err.message}`;
      setError(detailedError);
      toast({
        title: 'Error Loading Kanban Board',
        description: detailedError,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [pbClient, toast]);

  useEffect(() => {
    fetchKanbanData();
  }, [fetchKanbanData]);

  const onTaskDragEnd = async (active: Active, over: Over | null) => {
    if (!over || active.id === over.id) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const newStatus = over.id as TaskStatus;

    // Optimistic UI update
    const originalTasks = tasks;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === active.id ? { ...task, status: newStatus } : task
      )
    );

    try {
      await updateTask(pbClient!, active.id, { status: newStatus });
      toast({
        title: 'Task Updated',
        description: `Task "${activeTask.title}" moved to ${newStatus}.`,
      });
    } catch (err: any) {
      // Revert on failure
      setTasks(originalTasks);
      toast({
        title: 'Update Failed',
        description: `Could not move task: ${err.message}`,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10 min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading Kanban board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Failed to Load Board</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={fetchKanbanData} className="mt-6">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <h1 className="text-2xl md:text-3xl font-headline font-semibold">Kanban Board</h1>
      <KanbanBoard
        columns={initialColumns}
        tasks={tasks}
        onTaskDragEnd={onTaskDragEnd}
      />
    </div>
  );
}
