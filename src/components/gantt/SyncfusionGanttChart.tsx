
"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GanttComponent, Inject, Edit, Selection, Toolbar, DayMarkers, Sort } from '@syncfusion/ej2-react-gantt';
import { registerLicense } from '@syncfusion/ej2-base';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-react-gantt/styles/material.css';

import { useAuth } from '@/context/AuthContext';
import { getTasks, updateTask as updateTaskService } from '@/services/taskService';
import { useToast } from "@/hooks/use-toast";
import type { Task } from '@/lib/types';
import type PocketBase from 'pocketbase';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// IMPORTANT: Register your Syncfusion license key here. 
// You can get a free community license from Syncfusion.
// Not including a key will result in a licensing banner on the component.
// registerLicense('YOUR_SYNCFUSION_LICENSE_KEY');

interface SyncfusionGanttTask {
    TaskID: string;
    TaskName: string;
    StartDate: Date;
    EndDate: Date;
    Duration?: number;
    Progress: number;
    parentID?: string | null;
    isMilestone?: boolean;
    Predecessor?: string;
    Notes?: string;
    TaskType?: string;
}

const mapPbTaskToSyncfusion = (task: Task, allTasksMap: Map<string, Task>): SyncfusionGanttTask => {
    const parent = task.task_type === 'VALIDATION_STEP' && task.dependencies?.[0] ? task.dependencies[0] : null;
    
    // Syncfusion requires EndDate to be exclusive for duration calculation. 
    // If a task ends on the 5th, we need to provide the 6th.
    // However, for milestones, start and end should be the same.
    const endDateForSyncfusion = task.isMilestone ? new Date(task.dueDate!) : new Date(new Date(task.dueDate!).getTime() + (24*60*60*1000));

    const dependencies = task.dependencies
        ?.filter(depId => depId !== parent && allTasksMap.has(depId))
        .map(depId => `${depId}FS`) // FS - Finish-to-Start dependency
        .join(',');

    return {
        TaskID: task.id,
        TaskName: task.title,
        StartDate: new Date(task.startDate!),
        EndDate: endDateForSyncfusion,
        Progress: task.progress ?? 0,
        parentID: parent,
        isMilestone: task.isMilestone,
        Predecessor: dependencies,
        Notes: task.description,
        TaskType: task.task_type,
    };
};

export const SyncfusionGanttChart = () => {
    const { pbClient } = useAuth();
    const { toast } = useToast();
    const [ganttData, setGanttData] = useState<SyncfusionGanttTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    let ganttInstance = useRef<GanttComponent | null>(null);

    const fetchData = useCallback(async (pb: PocketBase) => {
        setIsLoading(true);
        setError(null);
        try {
            const allTasks = await getTasks(pb, {
                filter: 'task_type="VALIDATION_PROJECT" || task_type="VALIDATION_STEP"',
                sort: 'startDate',
            });
            const validTasks = allTasks.filter(t => t.startDate && t.dueDate);
            const allTasksMap = new Map<string, Task>(validTasks.map(t => [t.id, t]));
            const syncfusionData = validTasks.map(task => mapPbTaskToSyncfusion(task, allTasksMap));
            setGanttData(syncfusionData);
        } catch (e: any) {
            setError(e.message || "Failed to fetch validation project data.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (pbClient) {
            fetchData(pbClient);
        }
    }, [pbClient, fetchData]);

    const taskFields = {
        id: 'TaskID',
        name: 'TaskName',
        startDate: 'StartDate',
        endDate: 'EndDate',
        duration: 'Duration',
        progress: 'Progress',
        dependency: 'Predecessor',
        parentID: 'parentID',
        milestone: 'isMilestone',
        notes: 'Notes',
        child: 'subtasks' // Syncfusion automatically maps children to this field
    };
    
    const editSettings = {
        allowEditing: true,
        allowTaskbarEditing: true,
        allowAdding: false, // Adding will be handled by a dedicated form
        allowDeleting: false, // Deleting will be handled by a custom button/menu
    };

    const toolbarSettings = ['ZoomIn', 'ZoomOut', 'ZoomToFit', 'ExpandAll', 'CollapseAll'];

    const handleActionComplete = async (args: any) => {
        if (args.requestType === 'taskbarEditing' || args.requestType === 'editing') {
            const updatedTaskData = args.data as SyncfusionGanttTask;
            const taskId = updatedTaskData.TaskID;

            const updates: Partial<Task> = {
                title: updatedTaskData.TaskName,
                startDate: updatedTaskData.StartDate,
                // Adjust EndDate back for PocketBase: Syncfusion's EndDate is exclusive.
                dueDate: new Date(updatedTaskData.EndDate.getTime() - (24 * 60 * 60 * 1000)),
                progress: updatedTaskData.Progress,
            };
            
            try {
                if (pbClient) {
                    await updateTaskService(pbClient, taskId, updates);
                    toast({
                        title: 'Task Updated',
                        description: `Task "${updatedTaskData.TaskName}" has been successfully updated.`
                    });
                }
            } catch (err: any) {
                toast({
                    title: 'Update Failed',
                    description: `Could not update task: ${err.message}`,
                    variant: 'destructive'
                });
                // On failure, refresh data from server to revert changes in UI
                if (pbClient) fetchData(pbClient);
            }
        }
    };
    
    if (isLoading) {
        return <div className="flex items-center justify-center p-4 min-h-[400px]"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading chart data...</div>;
    }

    if (error) {
        return <div className="flex flex-col items-center justify-center p-4 text-destructive min-h-[400px]">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="font-semibold">Failed to load data</p>
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => pbClient && fetchData(pbClient)} className="mt-4">Try Again</Button>
        </div>;
    }

    if (ganttData.length === 0) {
        return <div className="text-center p-4 text-muted-foreground min-h-[400px]">No validation projects with valid dates to display.</div>
    }

    return (
        <div className='control-pane'>
            <div className='control-section'>
                <GanttComponent
                    ref={ganttInstance}
                    dataSource={ganttData}
                    taskFields={taskFields}
                    treeColumnIndex={1}
                    allowSorting={true}
                    allowResizing={true}
                    editSettings={editSettings}
                    toolbar={toolbarSettings}
                    projectStartDate={new Date()}
                    projectEndDate={new Date(new Date().getFullYear() + 2, 11, 31)}
                    dayWorkingTime={[{ from: 0, to: 24 }]} // Show tasks 24/7
                    timelineSettings={{
                        timelineViewMode: 'Week', // Initial view
                        topTier: { unit: 'Month' },
                        bottomTier: { unit: 'Week', format: "'Week' W" }
                    }}
                    gridLines="Both"
                    height="100%"
                    width="100%"
                    actionComplete={handleActionComplete}
                >
                    <Inject services={[Edit, Selection, Toolbar, DayMarkers, Sort]} />
                </GanttComponent>
            </div>
        </div>
    );
};
