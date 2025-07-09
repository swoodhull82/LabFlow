
"use client";

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { createPortal } from 'react-dom';

import { KanbanColumn } from './column';
import { KanbanCard, TaskCardProps } from './card';
import type { Task } from '@/lib/types';

export interface Column {
  id: string;
  title: string;
}

interface KanbanBoardProps {
  columns: Column[];
  tasks: Task[];
  onTaskDragEnd: (active: any, over: any) => void;
}

export function KanbanBoard({ columns, tasks, onTaskDragEnd }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  function onDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'Task') {
      setActiveTask(event.active.data.current.task);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    onTaskDragEnd(active, over);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto p-2">
        <div className="flex gap-4">
          <SortableContext items={columnsId}>
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasks.filter((task) => task.status === col.id)}
              />
            ))}
          </SortableContext>
        </div>
      </div>

      {createPortal(
        <DragOverlay>
          {activeTask && (
            <KanbanCard task={activeTask} />
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
