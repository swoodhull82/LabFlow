'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import type { DragEndEvent } from '@dnd-kit/core';
import { useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { addMonths, endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/context/AuthContext';
import { getEmployees } from '@/services/employeeService';
import type { Employee } from '@/lib/types';


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
  const { pbClient } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);

  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [newCardGroup, setNewCardGroup] = useState<typeof newGroups[0] | null>(null);

  const fetchTeamMembers = useCallback(async () => {
    if (!pbClient) return;
    setIsLoadingEmployees(true);
    try {
      const fetchedEmployees = await getEmployees(pbClient);
      setEmployees(fetchedEmployees);
    } catch (error) {
      console.error("Failed to fetch employees for Kanban:", error);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [pbClient]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);
  
  const kanbanOwners = useMemo(() => {
    if (employees.length === 0) {
      return [
        { id: 'placeholder-1', image: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=placeholder', name: 'Loading...' },
      ];
    }
    return employees.map(emp => ({
      id: emp.id,
      image: `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${emp.id}`,
      name: emp.name
    }));
  }, [employees]);

  const initialFeatures = useMemo(() => {
    if (kanbanOwners.length <= 1 && employees.length > 0) return []; // Wait for full employee list if possible
    
    // Helper to get an owner by index, cycling through available owners
    const getOwner = (index: number) => kanbanOwners[index % kanbanOwners.length];

    return [
      {
        id: '1',
        name: 'Develop new customer feedback form',
        startAt: startOfMonth(subMonths(today, 2)),
        endAt: endOfMonth(subMonths(today, 1)),
        status: exampleStatuses[2], // Done
        group: newGroups[0], // Customer Service
        owner: getOwner(0),
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
        owner: getOwner(1),
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
        owner: getOwner(2),
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
        owner: getOwner(3),
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
        owner: getOwner(4 % kanbanOwners.length),
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
        owner: getOwner(1),
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
        owner: getOwner(5 % kanbanOwners.length),
        initiative: { id: '3', name: 'Inventory Management' },
        release: { id: '3', name: 'v1.2' },
      },
    ];
  }, [kanbanOwners, employees.length]);

  const [features, setFeatures] = useState(initialFeatures);

  useEffect(() => {
    // This effect synchronizes the features state once the initialFeatures are properly computed with fetched employees.
    setFeatures(initialFeatures);
  }, [initialFeatures]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const overIdParts = over.id.toString().split('-');
    const statusName = overIdParts[0];

    const status = exampleStatuses.find((s) => s.name === statusName);

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

  const handleAddCardClick = (group: typeof newGroups[0]) => {
    setNewCardGroup(group);
    setIsAddCardOpen(true);
  };

  const handleAddCardSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const cardName = formData.get('cardName') as string;
    const ownerId = formData.get('ownerId') as string;
    const statusId = formData.get('statusId') as string;

    if (!cardName || !ownerId || !statusId || !newCardGroup) return;

    const owner = kanbanOwners.find(o => o.id === ownerId);
    const status = exampleStatuses.find(s => s.id === statusId);

    if (!owner || !status) return;

    const newFeature = {
      id: `feature-${Date.now()}`,
      name: cardName,
      startAt: today,
      endAt: addMonths(today, 1),
      status: status,
      group: newCardGroup,
      owner: owner,
      initiative: { id: 'temp-id', name: `${newCardGroup.name} Initiative` },
      release: { id: 'temp-id', name: 'Next Release' },
    };

    setFeatures(prev => [...prev, newFeature]);
    setIsAddCardOpen(false);
    setNewCardGroup(null);
  };

  const tasksByGroupAndStatus = useMemo(() => {
    const grouped = features.reduce((acc, feature) => {
      const groupName = feature.group.name;
      const statusName = feature.status.name;
      if (!acc[groupName]) {
        acc[groupName] = {};
      }
      if (!acc[groupName][statusName]) {
        acc[groupName][statusName] = [];
      }
      acc[groupName][statusName].push(feature);
      return acc;
    }, {} as Record<string, Record<string, typeof features>>);
    return grouped;
  }, [features]);

  return (
    <>
      <KanbanProvider onDragEnd={handleDragEnd} className="p-4">
        <div className="grid grid-cols-[200px_1fr_1fr_1fr] gap-4 w-full">
          {/* Header Row */}
          <div className="font-semibold text-lg p-2">Category</div>
          {exampleStatuses.map((status) => (
            <div key={status.name} className="p-2">
              <KanbanHeader name={status.name} color={status.color} />
            </div>
          ))}
          
          <div className="col-span-4"><Separator /></div>

          {/* Swimlane Rows */}
          {newGroups.map((group) => (
            <React.Fragment key={group.id}>
              {/* Swimlane Label */}
              <div className="p-2 h-full flex flex-col">
                <h3 className="text-md font-semibold text-foreground sticky top-4">{group.name}</h3>
                <Button
                  variant="ghost"
                  className="w-full mt-2 text-muted-foreground justify-start px-0"
                  onClick={() => handleAddCardClick(group)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add a card
                </Button>
              </div>
              {/* Status Columns for the swimlane */}
              {exampleStatuses.map((status) => (
                <KanbanBoard key={`${group.name}-${status.name}`} id={`${status.name}-${group.name}`}>
                  <KanbanCards>
                    {(tasksByGroupAndStatus[group.name]?.[status.name] || []).map((feature, index) => (
                      <KanbanCard
                        key={feature.id}
                        id={feature.id}
                        name={feature.name}
                        parent={`${status.name}-${group.name}`}
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
                  </KanbanCards>
                </KanbanBoard>
              ))}
              <div className="col-span-4"><Separator /></div>
            </React.Fragment>
          ))}
        </div>
      </KanbanProvider>
      <Dialog open={isAddCardOpen} onOpenChange={setIsAddCardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Card to {newCardGroup?.name}</DialogTitle>
            <DialogDescription>
              Fill in the details for your new task.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCardSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cardName" className="text-right">
                  Name
                </Label>
                <Input
                  id="cardName"
                  name="cardName"
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="ownerId" className="text-right">
                  Owner
                </Label>
                <Select name="ownerId" required disabled={isLoadingEmployees}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder={isLoadingEmployees ? <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> <span>Loading...</span></div> : "Select an owner"} />
                    </SelectTrigger>
                    <SelectContent>
                        {!isLoadingEmployees && kanbanOwners.map(owner => (
                            <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="statusId" className="text-right">
                  Status
                </Label>
                <Select name="statusId" defaultValue={exampleStatuses[0].id} required>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                        {exampleStatuses.map(status => (
                            <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsAddCardOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoadingEmployees}>Add Card</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Example;
