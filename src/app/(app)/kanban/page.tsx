
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
import { Plus, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/context/AuthContext';
import { getEmployees } from '@/services/employeeService';
import type { Employee } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';


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

const getInitials = (name: string = "") => {
  return name.split(' ').map((n) => n[0]).join('');
}

const Example = () => {
  const { pbClient, user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);

  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [newCardGroup, setNewCardGroup] = useState<typeof newGroups[0] | null>(null);

  // State for the new card form
  const [newCardName, setNewCardName] = useState('');
  const [newCardAssignee, setNewCardAssignee] = useState(user?.id || '');
  const [newCardStatus, setNewCardStatus] = useState(exampleStatuses[0].id);
  const [newCardSteps, setNewCardSteps] = useState<{ id: string, name: string, completed: boolean }[]>([]);
  const [currentStepInput, setCurrentStepInput] = useState('');

  const fetchTeamMembers = useCallback(async () => {
    if (!pbClient) return;
    setIsLoadingEmployees(true);
    try {
      const fetchedEmployees = await getEmployees(pbClient);
      setEmployees(fetchedEmployees);
      if(user?.id) {
        setNewCardAssignee(user.id);
      } else if (fetchedEmployees.length > 0) {
        setNewCardAssignee(fetchedEmployees[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch employees for Kanban:", error);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [pbClient, user?.id]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);
  
  const kanbanOwners = useMemo(() => {
    if (employees.length === 0) {
      return [];
    }
    return employees.map(emp => ({
      id: emp.id,
      name: emp.name
    }));
  }, [employees]);

  const initialFeatures = useMemo(() => {
    if (kanbanOwners.length <= 1 && employees.length > 0) return []; // Wait for full employee list if possible
    
    const getOwner = (index: number) => kanbanOwners[index % kanbanOwners.length];
    const getCreator = (index: number) => kanbanOwners[index % kanbanOwners.length];

    return [
      {
        id: '1',
        name: 'Develop new customer feedback form',
        startAt: startOfMonth(subMonths(today, 2)),
        endAt: endOfMonth(subMonths(today, 1)),
        status: exampleStatuses[2], // Done
        group: newGroups[0], // Customer Service
        owner: getOwner(0),
        createdBy: getCreator(0),
        initiative: { id: '1', name: 'Client Relations Q3' },
        release: { id: '1', name: 'v1.0' },
        steps: [
            { id: 'step-1-1', name: 'Draft feedback questions', completed: true },
            { id: 'step-1-2', name: 'Design form layout', completed: true },
            { id: 'step-1-3', name: 'Implement and test form', completed: true },
        ]
      },
      {
        id: '2',
        name: 'Quarterly ICP-MS Maintenance',
        startAt: startOfMonth(today),
        endAt: addMonths(endOfMonth(today), 1),
        status: exampleStatuses[1], // In Progress
        group: newGroups[1], // Instrument Management
        owner: getOwner(1),
        createdBy: getCreator(1),
        initiative: { id: '2', name: 'Lab Operations' },
        release: { id: '1', name: 'v1.0' },
        steps: [
            { id: 'step-2-1', name: 'Clean cones and injector', completed: true },
            { id: 'step-2-2', name: 'Replace tubing', completed: false },
            { id: 'step-2-3', name: 'Run performance check', completed: false },
        ]
      },
      {
        id: '3',
        name: 'Restock common reagents',
        startAt: startOfMonth(today),
        endAt: subDays(endOfMonth(today), 5),
        status: exampleStatuses[1], // In Progress
        group: newGroups[2], // Supply Chain & Ordering
        owner: getOwner(2),
        createdBy: getCreator(2),
        initiative: { id: '3', name: 'Inventory Management' },
        release: { id: '2', name: 'v1.1' },
        steps: [
             { id: 'step-3-1', name: 'Inventory check', completed: true },
             { id: 'step-3-2', name: 'Create purchase order', completed: false },
        ]
      },
      {
        id: '4',
        name: 'Update Safety Data Sheets (SDS)',
        startAt: addMonths(startOfMonth(today), 1),
        endAt: addMonths(endOfMonth(today), 2),
        status: exampleStatuses[0], // Planned
        group: newGroups[3], // General Projects
        owner: getOwner(3),
        createdBy: getCreator(3),
        initiative: { id: '4', name: 'Compliance 2024' },
        release: { id: '2', name: 'v1.1' },
        steps: []
      },
      {
        id: '5',
        name: 'Onboard new client: Acme Inc.',
        startAt: startOfMonth(today),
        endAt: endOfMonth(today),
        status: exampleStatuses[1], // In Progress
        group: newGroups[0], // Customer Service
        owner: getOwner(4 % kanbanOwners.length),
        createdBy: getCreator(0),
        initiative: { id: '1', name: 'Client Relations Q3' },
        release: { id: '2', name: 'v1.1' },
        steps: [
            { id: 'step-5-1', name: 'Kickoff call', completed: true },
            { id: 'step-5-2', name: 'Set up account in LIMS', completed: false },
        ]
      },
      {
        id: '6',
        name: 'Calibrate pH meters',
        startAt: subDays(startOfMonth(today), 10),
        endAt: startOfMonth(today),
        status: exampleStatuses[2], // Done
        group: newGroups[1], // Instrument Management
        owner: getOwner(1),
        createdBy: getCreator(1),
        initiative: { id: '2', name: 'Lab Operations' },
        release: { id: '3', name: 'v1.2' },
        steps: [
            { id: 'step-6-1', name: 'Calibrate with pH 4 buffer', completed: true },
            { id: 'step-6-2', name: 'Calibrate with pH 7 buffer', completed: true },
            { id: 'step-6-3', name: 'Calibrate with pH 10 buffer', completed: true },
        ]
      },
        {
        id: '7',
        name: 'Evaluate new pipette supplier',
        startAt: addMonths(startOfMonth(today), 2),
        endAt: addMonths(endOfMonth(today), 2),
        status: exampleStatuses[0], // Planned
        group: newGroups[2], // Supply Chain & Ordering
        owner: getOwner(5 % kanbanOwners.length),
        createdBy: getCreator(2),
        initiative: { id: '3', name: 'Inventory Management' },
        release: { id: '3', name: 'v1.2' },
        steps: []
      },
    ];
  }, [kanbanOwners, employees.length]);

  const [features, setFeatures] = useState(initialFeatures);

  useEffect(() => {
    setFeatures(initialFeatures);
  }, [initialFeatures]);
  
  const toggleStep = (featureId: string, stepId: string) => {
    setFeatures(features =>
      features.map(feature => {
        if (feature.id === featureId) {
          return {
            ...feature,
            steps: feature.steps.map(step => {
              if (step.id === stepId) {
                return { ...step, completed: !step.completed };
              }
              return step;
            }),
          };
        }
        return feature;
      })
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
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
  
  const resetAndCloseForm = () => {
    setIsAddCardOpen(false);
    setNewCardName('');
    setNewCardAssignee(user?.id || '');
    setNewCardStatus(exampleStatuses[0].id);
    setNewCardSteps([]);
    setCurrentStepInput('');
    setNewCardGroup(null);
  };

  const handleAddCardClick = (group: typeof newGroups[0]) => {
    setNewCardGroup(group);
    setIsAddCardOpen(true);
  };
  
  const handleAddStep = () => {
    if (currentStepInput.trim()) {
      setNewCardSteps([...newCardSteps, { id: `new-step-${Date.now()}`, name: currentStepInput.trim(), completed: false }]);
      setCurrentStepInput('');
    }
  };
  
  const handleRemoveStep = (stepId: string) => {
    setNewCardSteps(newCardSteps.filter(step => step.id !== stepId));
  };

  const handleAddCardSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!newCardName || !newCardAssignee || !newCardStatus || !newCardGroup || !user) return;

    const owner = kanbanOwners.find(o => o.id === newCardAssignee);
    const creator = kanbanOwners.find(o => o.id === user.id);
    const status = exampleStatuses.find(s => s.id === newCardStatus);

    if (!owner || !status || !creator) return;

    const newFeature = {
      id: `feature-${Date.now()}`,
      name: newCardName,
      startAt: today,
      endAt: addMonths(today, 1),
      status: status,
      group: newCardGroup,
      owner: owner,
      createdBy: creator,
      initiative: { id: 'temp-id', name: `${newCardGroup.name} Initiative` },
      release: { id: 'temp-id', name: 'Next Release' },
      steps: newCardSteps,
    };

    setFeatures(prev => [...prev, newFeature]);
    resetAndCloseForm();
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
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="m-0 flex-1 font-medium text-sm">
                              {feature.name}
                            </p>
                            {feature.createdBy && (
                              <Avatar className="h-4 w-4 shrink-0">
                                <AvatarFallback>
                                  {getInitials(feature.createdBy.name)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                          {feature.steps && feature.steps.length > 0 && (
                            <div className="space-y-1.5">
                                {feature.steps.map(step => (
                                    <div key={step.id} className="flex items-center gap-2">
                                        <Checkbox 
                                            id={`step-${step.id}`} 
                                            checked={step.completed} 
                                            onCheckedChange={() => toggleStep(feature.id, step.id)}
                                            className="h-3 w-3"
                                        />
                                        <label
                                            htmlFor={`step-${step.id}`}
                                            className="text-xs font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {step.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-muted-foreground text-xs mt-1">
                             <p className="m-0">
                                {shortDateFormatter.format(feature.startAt)} -{' '}
                                {dateFormatter.format(feature.endAt)}
                            </p>
                          </div>
                        </div>
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
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                  className="col-span-3"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="assignee" className="text-right">
                  Assignee
                </Label>
                <Select name="assignee" value={newCardAssignee} onValueChange={setNewCardAssignee} required disabled={isLoadingEmployees}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder={isLoadingEmployees ? <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> <span>Loading...</span></div> : "Select an assignee"} />
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
                <Select name="statusId" value={newCardStatus} onValueChange={setNewCardStatus} required>
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
               <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="newStep" className="text-right pt-2">
                    Steps
                  </Label>
                  <div className="col-span-3 space-y-2">
                    {newCardSteps.length > 0 && (
                      <div className="space-y-1 rounded-md border p-2">
                        {newCardSteps.map(step => (
                          <div key={step.id} className="flex items-center justify-between text-sm">
                            <span>{step.name}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveStep(step.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        id="newStep"
                        placeholder="Add a new step..."
                        value={currentStepInput}
                        onChange={e => setCurrentStepInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(); } }}
                      />
                      <Button type="button" onClick={handleAddStep}>Add</Button>
                    </div>
                  </div>
                </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={resetAndCloseForm}>Cancel</Button>
              <Button type="submit" disabled={isLoadingEmployees}>Add Card</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Example;
