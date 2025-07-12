
'use client';
import type { KanbanCard, KanbanStatus, KanbanGroup, KanbanStep } from "@/lib/types";
import PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const aDay = 24 * 60 * 60 * 1000;
const now = Date.now();

// Helper to convert PocketBase records to our application types
const pbToStatus = (record: any): KanbanStatus => ({
    id: record.id,
    name: record.name,
    color: record.color,
    order: record.order,
});

const pbToGroup = (record: any): KanbanGroup => ({
    id: record.id,
    name: record.name,
    order: record.order,
});

const pbToStep = (record: any): KanbanStep => ({
    id: record.id,
    card: record.card,
    name: record.name,
    completed: record.completed,
    assignees: record.assignees || [],
    order: record.order,
});

const pbToCard = (record: any): KanbanCard => ({
    id: record.id,
    name: record.name,
    status: record.status, // This is a single ID
    group: record.group,   // This is a single ID
    owners: record.owners || [],
    createdBy: record.createdBy,
    startAt: record.startAt ? new Date(record.startAt) : new Date(now - aDay * 7),
    endAt: record.endAt ? new Date(record.endAt) : new Date(),
    order: record.order,
    created: new Date(record.created),
    updated: new Date(record.updated),
    steps: record.expand?.['kanban_steps(card)']?.map(pbToStep) || [],
    expand: record.expand,
});

interface KanbanData {
    statuses: KanbanStatus[];
    groups: KanbanGroup[];
    cards: KanbanCard[];
}

export const getKanbanData = async (pb: PocketBase, options?: { signal?: AbortSignal }): Promise<KanbanData> => {
    try {
        const [statuses, groups, cards] = await Promise.all([
            withRetry(() => pb.collection('kanban_statuses').getFullList({ sort: 'order' }, options), { ...options, context: 'fetching kanban statuses' }),
            withRetry(() => pb.collection('kanban_groups').getFullList({ sort: 'order' }, options), { ...options, context: 'fetching kanban groups' }),
            withRetry(() => pb.collection('kanban_cards').getFullList({
                sort: 'order',
                expand: 'kanban_steps(card),status,group,owners,createdBy', // Expand all relations
            }, options), { ...options, context: 'fetching kanban cards' })
        ]);

        return {
            statuses: statuses.map(pbToStatus),
            groups: groups.map(pbToGroup),
            cards: cards.map(pbToCard),
        };
    } catch (error: any) {
        if (error.isAbort) throw error;
        console.error("Failed to fetch Kanban board data:", error);
        if (error.status === 404) {
             throw new Error("Could not load the Kanban board because one or more required collections (kanban_statuses, kanban_groups, kanban_cards) were not found. Please check your PocketBase setup.");
        }
        throw new Error("Could not load the Kanban board. Please ensure the required collections exist and have the correct permissions.");
    }
};

export const createKanbanCard = async (pb: PocketBase, data: { [key: string]: any }): Promise<KanbanCard> => {
    try {
        const record = await pb.collection('kanban_cards').create(data, { expand: 'kanban_steps(card),status,group,owners,createdBy' });
        return pbToCard(record);
    } catch (error) {
        console.error("Failed to create Kanban card:", error);
        throw error;
    }
};

export const updateKanbanCardStatus = async (pb: PocketBase, cardId: string, statusId: string): Promise<KanbanCard> => {
    try {
        const record = await pb.collection('kanban_cards').update(cardId, { status: statusId }, { expand: 'kanban_steps(card),status,group,owners,createdBy' });
        return pbToCard(record);
    } catch (error) {
        console.error(`Failed to update status for card ${cardId}:`, error);
        throw error;
    }
};

export const createKanbanStep = async (pb: PocketBase, data: Partial<KanbanStep>): Promise<KanbanStep> => {
    try {
        const record = await pb.collection('kanban_steps').create(data);
        return pbToStep(record);
    } catch (error) {
        console.error("Failed to create Kanban step:", error);
        throw error;
    }
};

export const updateKanbanStep = async (pb: PocketBase, stepId: string, data: Partial<KanbanStep>): Promise<KanbanStep> => {
    try {
        const record = await pb.collection('kanban_steps').update(stepId, data);
        return pbToStep(record);
    } catch (error) {
        console.error(`Failed to update step ${stepId}:`, error);
        throw error;
    }
};

export const deleteKanbanCard = async (pb: PocketBase, cardId: string): Promise<void> => {
    try {
        // Find and delete all associated steps first to prevent orphaned records
        const steps = await withRetry(() => pb.collection('kanban_steps').getFullList({ filter: `card = "${cardId}"` }), { context: `finding steps for card ${cardId}` });
        
        const deleteStepPromises = steps.map(step =>
            withRetry(() => pb.collection('kanban_steps').delete(step.id), { context: `deleting step ${step.id}` })
        );
        await Promise.all(deleteStepPromises);
        
        // After all steps are deleted, delete the card itself
        await withRetry(() => pb.collection('kanban_cards').delete(cardId), { context: `deleting card ${cardId}` });
    } catch (error) {
        console.error(`Failed to delete card ${cardId} and its steps:`, error);
        throw error;
    }
};
