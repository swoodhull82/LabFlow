
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useState, useMemo } from 'react';
import { addMonths, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import { Separator } from '@/components/ui/separator';

const today = new Date();

const exampleStatuses = [
  { id: '1', name: 'Planned', color: '#6B7280' },
  { id: '2', name: 'In Progress', color: '#F59E0B' },
  { id: '3', name: 'Done', color: '#10B981' },
];

const newGroups = [
  { id: '1', name: 'Customer Service' },
  { id: '2', name: 'Instrument Management' },
  { id: '3', name: 'Supply Chain & Ordering' },
  { id: '4', name: 'General Projects' },
]

const initialFeatures = [
  {
    id: '1',
    name: 'Develop new customer feedback form',
    startAt: startOfMonth(subMonths(today, 2)),
    endAt: endOfMonth(subMonths(today, 1)),
    status: exampleStatuses[2], // Done
    group: newGroups[0], // Customer Service
    owner: { id: '1', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=1', name: 'Alice Johnson' },
    initiative: { id: '1', name: 'Client Relations Q3' },
    release: { id: '1', name: 'v1.0' },
  },
  {
    id: '2',
    name: 'Quarterly ICP-MS Maintenance',
    startAt: startOfMonth(today),
    endAt: addMonths(endOfMonth(today), 1),
    status: exampleStatuses[1], // In Progress
    group: newGroups[1], // Instrument Management
    owner: { id: '2', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=2', name: 'Bob Smith' },
    initiative: { id: '2', name: 'Lab Operations' },
    release: { id: '1', name: 'v1.0' },
  },
  {
    id: '3',
    name: 'Restock common reagents',
    startAt: startOfMonth(today),
    endAt: subDays(endOfMonth(today), 5),
    status: exampleStatuses[1], // In Progress
    group: newGroups[2], // Supply Chain & Ordering
    owner: { id: '3', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=3', name: 'Charlie Brown' },
    initiative: { id: '3', name: 'Inventory Management' },
    release: { id: '2', name: 'v1.1' },
  },
  {
    id: '4',
    name: 'Update Safety Data Sheets (SDS)',
    startAt: addMonths(startOfMonth(today), 1),
    endAt: addMonths(endOfMonth(today), 2),
    status: exampleStatuses[0], // Planned
    group: newGroups[3], // General Projects
    owner: { id: '4', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=4', name: 'Diana Prince' },
    initiative: { id: '4', name: 'Compliance 2024' },
    release: { id: '2', name: 'v1.1' },
  },
  {
    id: '5',
    name: 'Onboard new client: Acme Inc.',
    startAt: startOfMonth(today),
    endAt: endOfMonth(today),
    status: exampleStatuses[1], // In Progress
    group: newGroups[0], // Customer Service
    owner: { id: '5', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=5', name: 'Ethan Hunt' },
    initiative: { id: '1', name: 'Client Relations Q3' },
    release: { id: '2', name: 'v1.1' },
  },
  {
    id: '6',
    name: 'Calibrate pH meters',
    startAt: subDays(startOfMonth(today), 10),
    endAt: startOfMonth(today),
    status: exampleStatuses[2], // Done
    group: newGroups[1], // Instrument Management
    owner: { id: '2', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=2', name: 'Bob Smith' },
    initiative: { id: '2', name: 'Lab Operations' },
    release: { id: '3', name: 'v1.2' },
  },
    {
    id: '7',
    name: 'Evaluate new pipette supplier',
    startAt: addMonths(startOfMonth(today), 2),
    endAt: addMonths(endOfMonth(today), 2),
    status: exampleStatuses[0], // Planned
    group: newGroups[2], // Supply Chain & Ordering
    owner: { id: '6', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=6', name: 'Fiona Gallagher' },
    initiative: { id: '3', name: 'Inventory Management' },
    release: { id: '3', name: 'v1.2' },
  },
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const Example = () => {
  const [features, setFeatures] = useState(initialFeatures);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const status = exampleStatuses.find((status) => status.name === over.id);

    if (!status) {
      return;
    }

    setFeatures(
      features.map((feature) => {
        if (feature.id === active.id) {
          return { ...feature, status };
        }

        return feature;
      })
    );
  };

  const tasksByStatusAndGroup = useMemo(() => {
    const grouped = features.reduce((acc, feature) => {
      const statusName = feature.status.name;
      const groupName = feature.group.name;
      if (!acc[statusName]) {
        acc[statusName] = {};
      }
      if (!acc[statusName][groupName]) {
        acc[statusName][groupName] = [];
      }
      acc[statusName][groupName].push(feature);
      return acc;
    }, {} as Record<string, Record<string, typeof features>>);
    return grouped;
  }, [features]);

  const allGroups = useMemo(() => {
    return newGroups.map(g => g.name);
  }, []);

  return (
    <KanbanProvider onDragEnd={handleDragEnd} className="p-4">
      {exampleStatuses.map((status) => (
        <KanbanBoard key={status.name} id={status.name}>
          <KanbanHeader name={status.name} color={status.color} />
          <KanbanCards className="gap-4">
            {allGroups.map((groupName, groupIndex) => (
              <div key={groupName} className="flex flex-col gap-2">
                {groupIndex > 0 && <Separator />}
                <h3 className="text-sm font-semibold text-muted-foreground px-1 pt-2">{groupName}</h3>
                {(tasksByStatusAndGroup[status.name]?.[groupName] || []).map((feature, index) => (
                  <KanbanCard
                    key={feature.id}
                    id={feature.id}
                    name={feature.name}
                    parent={status.name}
                    index={index}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="m-0 flex-1 font-medium text-sm">
                          {feature.name}
                        </p>
                        <p className="m-0 text-muted-foreground text-xs">
                          {feature.initiative.name}
                        </p>
                      </div>
                      {feature.owner && (
                        <Avatar className="h-4 w-4 shrink-0">
                          <AvatarImage src={feature.owner.image} />
                          <AvatarFallback>
                            {feature.owner.name?.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <p className="m-0 text-muted-foreground text-xs">
                      {shortDateFormatter.format(feature.startAt)} -{' '}
                      {dateFormatter.format(feature.endAt)}
                    </p>
                  </KanbanCard>
                ))}
              </div>
            ))}
          </KanbanCards>
        </KanbanBoard>
      ))}
    </KanbanProvider>
  );
};

export default Example;
