
"use client";

import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Task, Employee } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
}

const getInitials = (name: string = ""): string => {
    return name
        .split(' ')
        .map(n => n[0])
        .filter((_, i, arr) => i === 0 || i === arr.length - 1)
        .join('')
        .toUpperCase();
};

const getPriorityBadgeVariant = (priority?: string) => {
  if (!priority) return "default";
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return "destructive";
    case "high": return "destructive";
    case "medium": return "secondary";
    case "low": return "outline";
    default: return "default";
  }
};


export function KanbanCard({ task, isOverlay }: TaskCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="opacity-50 bg-primary/20 border-primary border-2 rounded-lg h-full"
      />
    );
  }

  const assignees = task.expand?.assignedTo || [];

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className={cn(
          "w-[280px] min-h-[120px] bg-card hover:shadow-md transition-shadow",
          isOverlay && "shadow-lg"
      )}>
        <CardHeader className="p-3">
          <div className="flex justify-between items-start">
            <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
            {task.dueDate && (
                <span className="text-xs text-muted-foreground">
                    Due: {format(new Date(task.dueDate), "MMM dd")}
                </span>
            )}
          </div>
          <CardTitle className="text-base font-medium pt-1">{task.title.replace(/_/g, ' ')}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex justify-between items-center">
            {assignees.length > 0 ? (
                 <TooltipProvider>
                    <div className="flex -space-x-2">
                        {assignees.slice(0, 3).map((assignee: Employee) => (
                        <Tooltip key={assignee.id}>
                            <TooltipTrigger asChild>
                            <Avatar className="h-7 w-7 border-2 border-background">
                                <AvatarFallback>{getInitials(assignee.name)}</AvatarFallback>
                            </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>{assignee.name}</TooltipContent>
                        </Tooltip>
                        ))}
                        {assignees.length > 3 && (
                            <Tooltip>
                            <TooltipTrigger asChild>
                                <Avatar className="h-7 w-7 border-2 border-background">
                                <AvatarFallback>+{assignees.length - 3}</AvatarFallback>
                                </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>And {assignees.length - 3} more</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </TooltipProvider>
            ) : ( <div /> )}
             <span className="text-xs text-muted-foreground">{task.task_type}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

