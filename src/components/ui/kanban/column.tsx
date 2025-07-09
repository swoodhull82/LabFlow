
"use client";

import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { useDndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMemo } from 'react';
import type { Task } from '@/lib/types';
import type { Column } from './board';
import { KanbanCard } from './card';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
}

export function KanbanColumn({ column, tasks }: KanbanColumnProps) {
  const tasksIds = useMemo(() => {
    return tasks.map((task) => task.id);
  }, [tasks]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-[300px] flex-col"
    >
      <div
        {...attributes}
        {...listeners}
        className="
          bg-muted
          text-md
          h-[50px]
          cursor-grab
          rounded-md
          rounded-b-none
          p-3
          font-semibold
          border-border
          border-x-2
          border-t-2
          flex
          items-center
          justify-between
        "
      >
        <div className="flex gap-2">
          {column.title}
          <div className="flex justify-center items-center bg-primary text-primary-foreground h-5 w-5 rounded-full text-xs">
            {tasks.length}
          </div>
        </div>
      </div>
      <div className="flex flex-grow flex-col gap-2 p-2 overflow-y-auto bg-muted/50 border-border border-x-2 border-b-2 rounded-b-md">
        <SortableContext items={tasksIds}>
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
