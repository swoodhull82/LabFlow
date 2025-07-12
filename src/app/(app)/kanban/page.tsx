
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
import {
  ListProvider,
  ListGroup,
  ListHeader as ListHeaderComponent,
  ListItems,
  ListItem
} from '@/components/ui/shadcn-io/list';
import type { DragEndEvent } from '@dnd-kit/core';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { addMonths, endOfMonth, startOfMonth, subMonths, format, formatDistanceToNow } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, X, List, Trello, Users, Check, AlertTriangle, Inbox } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/context/AuthContext';
import { getEmployees } from '@/services/employeeService';
import { getKanbanData, createKanbanCard, updateKanbanCardStatus, updateKanbanStep, createKanbanStep } from '@/services/kanbanService';
import type { Employee, KanbanCard as KanbanCardData, KanbanStatus, KanbanGroup, KanbanStep, User as AuthUser } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';

const getInitials = (name: string = "") => {
  return name.split(' ').map((n) => n[0]).join('');
}

const DEFAULT_STATUSES: KanbanStatus[] = [
    { id: 'status-todo', name: 'To Do', color: '#F59E0B', order: 1 },
    { id: 'status-inprogress', name: 'In Progress', color: '#3B82F6', order: 2 },
    { id: 'status-done', name: 'Done', color: '#10B981', order: 3 },
];

const DEFAULT_GROUPS: KanbanGroup[] = [
    { id: 'group-general', name: 'General Tasks', order: 1 },
];

const KanbanPage = () => {
  const { pbClient, user } = useAuth();
  const { toast } = useToast();

  // Data states
  const [statuses, setStatuses] = useState<KanbanStatus[]>([]);
  const [groups, setGroups] = useState<KanbanGroup[]>([]);
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // UI/Error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  // New Card Form states
  const [newCardGroup, setNewCardGroup] = useState<KanbanGroup | null>(null);
  const [newCardName, setNewCardName] = useState('');
  const [newCardAssigneeIds, setNewCardAssigneeIds] = useState<string[]>([]);
  const [newCardStatusId, setNewCardStatusId] = useState('');
  const [newCardSteps, setNewCardSteps] = useState<{ id: string, name: string, completed: boolean, assigneeIds: string[] }[]>([]);
  const [currentStepInput, setCurrentStepInput] = useState('');


  const fetchData = useCallback(async (pb, signal) => {
    if (!pb) return;
    setIsLoading(true);
    setError(null);
    try {
      const [kanbanData, fetchedEmployees] = await Promise.all([
        getKanbanData(pb, { signal }),
        getEmployees(pb, { signal }),
      ]);

      const liveStatuses = kanbanData.statuses.length > 0 ? kanbanData.statuses : DEFAULT_STATUSES;
      const liveGroups = kanbanData.groups.length > 0 ? kanbanData.groups : DEFAULT_GROUPS;

      setStatuses(liveStatuses);
      setGroups(liveGroups);
      setCards(kanbanData.cards);
      setEmployees(fetchedEmployees);
      if (liveStatuses.length > 0) {
        setNewCardStatusId(liveStatuses[0].id);
      }
    } catch (err: any) {
        const isCancellation = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
        if (!isCancellation) {
            console.error("Failed to fetch Kanban data:", err);
            setError(err.message || "An unexpected error occurred.");
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    if(pbClient) {
        fetchData(pbClient, controller.signal);
    }
    return () => controller.abort();
  }, [fetchData, pbClient]);


  const allUsersForAssigning = useMemo(() => {
    if (!user) return [];
    const allPeople = new Map<string, { id: string; name: string; email: string }>();

    // Add employees first
    employees.forEach(emp => {
      // Use the 'users' collection ID if available, otherwise fall back to employee ID for robustness
      const idToUse = emp.userId || emp.id;
      if (!allPeople.has(idToUse)) {
          allPeople.set(idToUse, { id: idToUse, name: emp.name, email: emp.email });
      }
    });

    // Add current authenticated user if not already in the map
    if (user.id && !allPeople.has(user.id)) {
      allPeople.set(user.id, { id: user.id, name: user.name || user.email, email: user.email });
    }

    return Array.from(allPeople.values());
  }, [employees, user]);


  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !pbClient) return;

    const overIdParts = over.id.toString().split('-');
    const statusName = overIdParts[0];

    const newStatus = statuses.find((s) => s.name === statusName);
    if (!newStatus || active.id === newStatus.id) return;

    const originalCard = cards.find(c => c.id === active.id);
    if (!originalCard || originalCard.status === newStatus.id) return;
    
    // Optimistic update
    setCards(currentCards => currentCards.map(card =>
      card.id === active.id ? { ...card, status: newStatus.id } : card
    ));

    try {
      await updateKanbanCardStatus(pbClient, active.id.toString(), newStatus.id);
      toast({ title: "Card Updated", description: `Moved to "${newStatus.name}".` });
    } catch (err: any) {
      // Revert on failure
      setCards(currentCards => currentCards.map(card =>
        card.id === active.id ? originalCard : card
      ));
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };


  const toggleStep = async (cardId: string, step: KanbanStep) => {
    if (!pbClient) return;

    const newCompletedState = !step.completed;
    
    // Optimistic update
    setCards(currentCards => currentCards.map(card => {
      if (card.id === cardId) {
        return {
          ...card,
          steps: card.steps.map(s => s.id === step.id ? { ...s, completed: newCompletedState } : s)
        };
      }
      return card;
    }));

    try {
      await updateKanbanStep(pbClient, step.id, { completed: newCompletedState });
    } catch (err: any) {
      // Revert on failure
      setCards(currentCards => currentCards.map(card => {
        if (card.id === cardId) {
          return {
            ...card,
            steps: card.steps.map(s => s.id === step.id ? step : s)
          };
        }
        return card;
      }));
      toast({ title: "Update Failed", description: "Could not update the step.", variant: "destructive" });
    }
  };

  const handleAddCardSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newCardName || !newCardStatusId || !newCardGroup || !user || !pbClient) return;
    
    const cardPayload = {
        name: newCardName,
        status: newCardStatusId,
        group: newCardGroup.id,
        createdBy: user.id,
        order: (cards.filter(c => c.group === newCardGroup.id).length + 1) * 10,
        owners: newCardAssigneeIds.length > 0 ? newCardAssigneeIds : [user.id],
    };

    try {
        const newCard = await createKanbanCard(pbClient, cardPayload);

        // Create steps if any, now that we have a valid card ID.
        if (newCardSteps.length > 0) {
            const stepPromises = newCardSteps.map((step, index) =>
                createKanbanStep(pbClient, {
                    card: newCard.id,
                    name: step.name,
                    completed: false,
                    assignees: step.assigneeIds,
                    order: (index + 1) * 10
                })
            );
            const createdSteps = await Promise.all(stepPromises);
            newCard.steps = createdSteps;
        }

        setCards(prev => [...prev, newCard]);
        toast({ title: "Success", description: `Card "${newCard.name}" created.` });
        resetAndCloseForm();
    } catch (err: any) {
        console.error("Error creating card on page:", err);
        toast({ title: "Error Creating Card", description: err.message, variant: "destructive" });
    }
  };


  // Helper functions for the new card dialog
  const resetAndCloseForm = () => {
    setIsAddCardOpen(false); setNewCardName(''); setNewCardAssigneeIds([]); 
    if (statuses.length > 0) setNewCardStatusId(statuses[0].id);
    setNewCardSteps([]); setCurrentStepInput(''); setNewCardGroup(null);
  };
  const handleAddCardClick = (group: KanbanGroup) => { setNewCardGroup(group); setIsAddCardOpen(true); };
  const handleAddStep = () => {
    if (currentStepInput.trim()) {
      setNewCardSteps([...newCardSteps, { id: `new-step-${Date.now()}`, name: currentStepInput.trim(), completed: false, assigneeIds: [] }]);
      setCurrentStepInput('');
    }
  };
  const handleRemoveStep = (stepId: string) => { setNewCardSteps(newCardSteps.filter(step => step.id !== stepId)); };
  const handleStepAssigneeChange = (stepId: string, assigneeId: string) => {
    setNewCardSteps(currentSteps => currentSteps.map(step => {
      if (step.id === stepId) {
        const newAssignees = step.assigneeIds.includes(assigneeId)
          ? step.assigneeIds.filter(id => id !== assigneeId)
          : [...step.assigneeIds, assigneeId];
        return { ...step, assigneeIds: newAssignees };
      }
      return step;
    }));
  };


  const tasksByGroupAndStatus = useMemo(() => {
    return cards.reduce((acc, card) => {
      const groupName = groups.find(g => g.id === card.group)?.name || 'Uncategorized';
      const statusName = statuses.find(s => s.id === card.status)?.name || 'Uncategorized';
      if (!acc[groupName]) acc[groupName] = {};
      if (!acc[groupName][statusName]) acc[groupName][statusName] = [];
      acc[groupName][statusName].push(card);
      return acc;
    }, {} as Record<string, Record<string, KanbanCardData[]>>);
  }, [cards, groups, statuses]);

  const tasksByStatus = useMemo(() => {
    return cards.reduce((acc, card) => {
      const statusName = statuses.find(s => s.id === card.status)?.name || 'Uncategorized';
      if (!acc[statusName]) acc[statusName] = [];
      acc[statusName].push(card);
      return acc;
    }, {} as Record<string, KanbanCardData[]>);
  }, [cards, statuses]);


  const cardRenderer = (card: KanbanCardData) => {
    const cardAssignees = allUsersForAssigning.filter(u => card.owners.includes(u.id));
    const cardCreator = allUsersForAssigning.find(u => u.id === card.createdBy);

    return (
      <>
        <div className="flex items-start justify-between gap-2">
          <p className="m-0 flex-1 font-medium text-sm">{card.name}</p>
          {cardCreator && (
             <Avatar className="h-5 w-5 shrink-0 border-2 border-background" title={`Created by: ${cardCreator.name}`}>
               <AvatarFallback>{getInitials(cardCreator.name)}</AvatarFallback>
             </Avatar>
          )}
        </div>
        
        {card.steps && card.steps.length > 0 && (
          <div className="space-y-1.5 mt-2 ml-2 pl-2 border-l">
              {card.steps.map(step => {
                  const stepAssignees = allUsersForAssigning.filter(u => step.assignees.includes(u.id));
                  return (
                      <div key={step.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                              <Checkbox 
                                  id={`step-${step.id}`} 
                                  checked={step.completed} 
                                  onCheckedChange={() => toggleStep(card.id, step)}
                                  className="h-3 w-3"
                              />
                              <label htmlFor={`step-${step.id}`} className="text-xs font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                  {step.name}
                              </label>
                          </div>
                          {stepAssignees.length > 0 && (
                            <div className="flex -space-x-1">
                                {stepAssignees.slice(0, 2).map(assignee => (
                                    <Avatar key={assignee.id} className="h-4 w-4 shrink-0 border border-background" title={`Step assigned to: ${assignee.name}`}>
                                        <AvatarFallback className="text-[10px]">{getInitials(assignee.name)}</AvatarFallback>
                                    </Avatar>
                                ))}
                                {stepAssignees.length > 2 && (
                                    <Avatar className="h-4 w-4 shrink-0 border border-background" title={`And ${stepAssignees.length-2} more`}>
                                        <AvatarFallback className="text-[8px]">{`+${stepAssignees.length-2}`}</AvatarFallback>
                                    </Avatar>
                                )}
                            </div>
                          )}
                      </div>
                  );
              })}
          </div>
        )}
        <div className="flex items-center justify-between text-muted-foreground text-xs mt-2">
          <p className="m-0" title={new Date(card.created).toLocaleString()}>
              {formatDistanceToNow(new Date(card.created), { addSuffix: true })}
          </p>
          {cardAssignees.length > 0 && (
            <div className="flex -space-x-2">
              {cardAssignees.slice(0, 2).map(assignee => (
                <Avatar key={assignee.id} className="h-5 w-5 shrink-0 border-2 border-background" title={`Assigned to: ${assignee.name}`}>
                  <AvatarFallback className="text-[10px]">{getInitials(assignee.name)}</AvatarFallback>
                </Avatar>
              ))}
              {cardAssignees.length > 2 && (
                <Avatar className="h-5 w-5 shrink-0 border-2 border-background" title={`And ${cardAssignees.length - 2} more`}>
                  <AvatarFallback className="text-[10px]">{`+${cardAssignees.length - 2}`}</AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
        </div>
      </>
    );
  };
  
  const MultiAssigneeSelect = ({
      label, selectedAssigneeIds, onSelectionChange, isLoading: isLoadingOptions, options, className,
  }: {
      label: string; selectedAssigneeIds: string[]; onSelectionChange: (id: string) => void;
      isLoading: boolean; options: { id: string; name: string }[]; className?: string;
  }) => {
      const selectedText = selectedAssigneeIds.length === 0 ? `Select ${label}...`
          : selectedAssigneeIds.length === 1 ? options.find((o) => o.id === selectedAssigneeIds[0])?.name ?? '1 selected'
          : `${selectedAssigneeIds.length} selected`;

      return (
          <Popover>
              <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", className)} disabled={isLoadingOptions}>
                      <Users className="mr-2 h-4 w-4" /> {selectedText}
                  </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                      <CommandInput placeholder={`Search ${label}...`} />
                      <CommandList>
                          <CommandEmpty>No results found.</CommandEmpty>
                          <CommandGroup>
                              {options.map((option) => (
                                  <CommandItem key={option.id} onSelect={(currentValue) => {
                                      onSelectionChange(option.id);
                                  }}>
                                      <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedAssigneeIds.includes(option.id) ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible')}>
                                          <Check className="h-4 w-4" />
                                      </div>
                                      <span>{option.name}</span>
                                  </CommandItem>
                              ))}
                          </CommandGroup>
                      </CommandList>
                  </Command>
              </PopoverContent>
          </Popover>
      );
  };
  
  if (isLoading) {
    return <div className="flex h-full items-center justify-center p-4"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error && (!statuses.length || !groups.length)) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold">Could Not Load Kanban Board</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
            There was an issue fetching board data. This might be due to a network issue or incorrect API rules on your PocketBase collections (kanban_statuses, kanban_groups, kanban_cards).
        </p>
        <p className="text-xs mt-2 text-muted-foreground max-w-md">Error: {error}</p>
        <Button className="mt-6" onClick={() => fetchData(pbClient, new AbortController().signal)}>Try Again</Button>
      </div>
    );
  }

  if ((!statuses.length || !groups.length) && !isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Kanban Board Needs Setup</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          To get started, please add at least one status (e.g., "To Do", "In Progress") and one group (e.g., "General Tasks") in your PocketBase admin panel for the `kanban_statuses` and `kanban_groups` collections.
        </p>
        <Button className="mt-6" onClick={() => fetchData(pbClient, new AbortController().signal)}>Refresh Data</Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end p-4">
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'board' | 'list')}>
          <TabsList>
            <TabsTrigger value="board"><Trello className="mr-2 h-4 w-4" /> Board</TabsTrigger>
            <TabsTrigger value="list"><List className="mr-2 h-4 w-4" /> List</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === 'board' ? (
        <KanbanProvider onDragEnd={handleDragEnd} className="p-4 pt-0">
          <div className="grid grid-cols-[200px_1fr_1fr_1fr] gap-4 w-full">
            <div className="font-semibold text-lg p-2">Category</div>
            {statuses.map((status) => (
              <div key={status.name} className="p-2">
                <KanbanHeader name={status.name} color={status.color} />
              </div>
            ))}
            
            <div className="col-span-4"><Separator /></div>

            {groups.map((group) => (
              <React.Fragment key={group.id}>
                <div className="p-2 h-full flex flex-col">
                  <h3 className="text-md font-semibold text-foreground sticky top-4">{group.name}</h3>
                  <Button variant="ghost" className="w-full mt-2 text-muted-foreground justify-start px-0" onClick={() => handleAddCardClick(group)}>
                    <Plus className="mr-2 h-4 w-4" /> Add a card
                  </Button>
                </div>
                {statuses.map((status) => (
                  <KanbanBoard key={`${group.name}-${status.name}`} id={`${status.name}-${group.name}`}>
                    <KanbanCards>
                      {(tasksByGroupAndStatus[group.name]?.[status.name] || []).map((card, index) => (
                        <KanbanCard key={card.id} id={card.id} name={card.name} parent={`${status.name}-${group.name}`} index={index}>
                          {cardRenderer(card)}
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
      ) : (
        <ListProvider onDragEnd={handleDragEnd}>
            {statuses.map((status) => (
            <ListGroup key={status.id} id={`${status.name}-list`}>
                <ListHeaderComponent name={status.name} color={status.color} />
                <ListItems>
                {(tasksByStatus[status.name] || []).map((card, index) => (
                    <ListItem key={card.id} id={card.id} name={card.name} parent={`${status.name}-list`} index={index}>
                        {cardRenderer(card)}
                    </ListItem>
                ))}
                </ListItems>
            </ListGroup>
            ))}
        </ListProvider>
      )}

      <Dialog open={isAddCardOpen} onOpenChange={setIsAddCardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Card to {newCardGroup?.name}</DialogTitle>
            <DialogDescription>Fill in the details for your new task.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCardSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cardName" className="text-right">Name</Label>
                <Input id="cardName" name="cardName" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} className="col-span-3" required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="assignees" className="text-right">Assignees</Label>
                   <div className="col-span-3">
                      <MultiAssigneeSelect label="Assignees" selectedAssigneeIds={newCardAssigneeIds}
                          onSelectionChange={(id) => setNewCardAssigneeIds((prev) => prev.includes(id) ? prev.filter((prevId) => prevId !== id) : [...prev, id])}
                          isLoading={isLoading} options={allUsersForAssigning} />
                  </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="statusId" className="text-right">Status</Label>
                <Select name="statusId" value={newCardStatusId} onValueChange={setNewCardStatusId} required>
                    <SelectTrigger className="col-span-3"><SelectValue placeholder="Select a status" /></SelectTrigger>
                    <SelectContent>
                        {statuses.map(status => (<SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>))}
                    </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="newStep" className="text-right pt-2">Steps</Label>
                  <div className="col-span-3 space-y-2">
                    {newCardSteps.length > 0 && (
                      <div className="space-y-2 rounded-md border p-2">
                        {newCardSteps.map(step => (
                          <div key={step.id} className="flex items-center justify-between text-sm gap-2">
                              <span className="flex-1 truncate">{step.name}</span>
                              <div className="flex items-center gap-2">
                                  <MultiAssigneeSelect label="Assignees" selectedAssigneeIds={step.assigneeIds}
                                      onSelectionChange={(id) => handleStepAssigneeChange(step.id, id)}
                                      isLoading={isLoading} options={allUsersForAssigning} className="h-7 text-xs" />
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveStep(step.id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input id="newStep" placeholder="Add a new step..." value={currentStepInput}
                        onChange={e => setCurrentStepInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(); } }} />
                      <Button type="button" onClick={handleAddStep}>Add</Button>
                    </div>
                  </div>
                </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={resetAndCloseForm}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>Add Card</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default KanbanPage;

    
