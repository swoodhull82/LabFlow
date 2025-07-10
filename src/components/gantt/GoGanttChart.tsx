
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as go from 'gojs';
import { ReactDiagram } from 'gojs-react';

const GoGanttChart = () => {
    const ganttRef = useRef<ReactDiagram | null>(null);
    const tasksRef = useRef<ReactDiagram | null>(null);
    const [modelText, setModelText] = useState('');

    useEffect(() => {
        // This effect runs once on component mount to initialize the GoJS diagrams.
        // It's a direct adaptation of the imperative code you provided.
        if (!ganttRef.current || !tasksRef.current) return;
        
        const myGantt = ganttRef.current.getDiagram();
        const myTasks = tasksRef.current.getDiagram();

        if (!(myGantt instanceof go.Diagram) || !(myTasks instanceof go.Diagram)) return;
        
        // Custom Layout for myGantt Diagram
        class GanttLayout extends go.Layout {
            cellHeight: number;
            constructor(init?: Partial<GanttLayout>) {
              super();
              this.cellHeight = GridCellHeight;
              if (init) Object.assign(this, init);
            }

            doLayout(coll: go.Diagram | go.Group | go.Iterable<go.Part>) {
              coll = this.collectParts(coll);
              const diagram = this.diagram;
              if (!diagram) return;
              diagram.startTransaction('Gantt Layout');
              const bars: go.Node[] = [];
              this.assignTimes(diagram, bars);
              this.arrangementOrigin = this.initialOrigin(this.arrangementOrigin);
              let y = this.arrangementOrigin.y;
              bars.forEach((node) => {
                const tasknode = myTasks.findNodeForData(node.data);
                if (!tasknode) return;
                node.visible = tasknode.isVisible();
                node.moveTo(convertStartToX(node.data.start), y);
                if (node.visible) y += this.cellHeight;
              });
              diagram.commitTransaction('Gantt Layout');
            }

            // Update node data, to make sure each node has a start and a duration
            assignTimes(diagram: go.Diagram, bars: go.Node[]) {
              const roots = diagram.findTreeRoots();
              roots.each((root) => this.walkTree(root, 0, bars));
            }

            walkTree(node: go.Node, start: number, bars: go.Node[]): number {
                if (!node.diagram) return start;
                bars.push(node);
                const model = node.diagram.model;
                if (node.isTreeLeaf) {
                    let dur = node.data.duration;
                    if (dur === undefined || isNaN(dur)) {
                    dur = convertDaysToUnits(1); // default task length?
                    model.set(node.data, 'duration', dur);
                    }
                    let st = node.data.start;
                    if (st === undefined || isNaN(st)) {
                    st = start; // use given START
                    model.set(node.data, 'start', st);
                    }
                    return st + dur;
                } else {
                    // first recurse to fill in any missing data
                    node.findTreeChildrenNodes().each((n) => {
                    start = this.walkTree(n, start, bars);
                    });
                    // now can calculate this non-leaf node's data
                    let min = Infinity;
                    let max = -Infinity;
                    const colors = new go.Set();
                    node.findTreeChildrenNodes().each((n) => {
                    min = Math.min(min, n.data.start);
                    max = Math.max(max, n.data.start + n.data.duration);
                    if (n.data.color) colors.add(n.data.color);
                    });
                    model.set(node.data, 'start', min);
                    model.set(node.data, 'duration', max - min);
                    return max;
                }
            }
        }
        // end of GanttLayout

        var GridCellHeight = 20; // document units; cannot be changed dynamically
        var GridCellWidth = 12; // document units per day; this can be modified -- see rescale()
        var TimelineHeight = 24; // document units; cannot be changed dynamically

        const MsPerDay = 24 * 60 * 60 * 1000;

        function convertDaysToUnits(n: number) {
            return n;
        }

        function convertUnitsToDays(n: number) {
            return n;
        }

        function convertStartToX(start: number) {
            return convertUnitsToDays(start) * GridCellWidth;
        }

        function convertXToStart(x: number, node: go.Part | null) {
            return convertDaysToUnits(x / GridCellWidth);
        }

        function convertDurationToW(duration: number) {
            return convertUnitsToDays(duration) * GridCellWidth;
        }

        function convertWToDuration(w: number) {
            return convertDaysToUnits(w / GridCellWidth);
        }

        function convertStartToPosition(start: number, node: go.Node) {
            return new go.Point(convertStartToX(start), node.position.y || 0);
        }

        function convertPositionToStart(pos: go.Point) {
            return convertXToStart(pos.x, null);
        }

        var StartDate = new Date(); // set from Model.modelData.origin

        function valueToText(n: number) {
            const startDate = StartDate;
            const startDateMs = startDate.getTime() + startDate.getTimezoneOffset() * 60000;
            const date = new Date(startDateMs + (n / GridCellWidth) * MsPerDay);
            return date.toLocaleDateString();
        }

        go.Shape.defineFigureGenerator('RangeBar', (shape, w, h) => {
            const b = Math.min(5, w);
            const d = Math.min(5, h);
            return new go.Geometry().add(
            new go.PathFigure(0, 0, true)
                .add(new go.PathSegment(go.SegmentType.Line, w, 0))
                .add(new go.PathSegment(go.SegmentType.Line, w, h))
                .add(new go.PathSegment(go.SegmentType.Line, w - b, h - d))
                .add(new go.PathSegment(go.SegmentType.Line, b, h - d))
                .add(new go.PathSegment(go.SegmentType.Line, 0, h).close())
            );
        });

        function standardContextMenus() {
            return {
            contextMenu: go.GraphObject.build('ContextMenu',
                go.GraphObject.build('ContextMenuButton', {
                    click: (e, button) => {
                    const task = button.part?.adornedPart;
                    }
                },
                new go.TextBlock('Details...')),
                go.GraphObject.build('ContextMenuButton', {
                    click: (e, button) => {
                    const task = button.part?.adornedPart;
                    if (!e.diagram || !task) return;
                    e.diagram.model.commit((m) => {
                        const newdata = { key: undefined, text: 'New Task', color: task.data.color, duration: convertDaysToUnits(5) };
                        m.addNodeData(newdata);
                        if (task.key && m instanceof go.GraphLinksModel) m.addLinkData({ from: task.key, to: m.getKeyForNodeData(newdata) });
                        const newNode = e.diagram.findNodeForData(newdata);
                        if(newNode) e.diagram.select(newNode);
                    }, 'new task');
                    }
                },
                new go.TextBlock('New Task'))
            )
            };
        }

        var myChangingSelection = false;

        // the tree on the left side of the page
        myTasks.initialContentAlignment = go.Spot.Right;
        myTasks.padding = new go.Margin(TimelineHeight + 4, 0, GridCellHeight, 0);
        myTasks.hasVerticalScrollbar = false;
        myTasks.allowMove = false;
        myTasks.allowCopy = false;
        myTasks.commandHandler.deletesTree = true;
        myTasks.layout = new go.TreeLayout({
            alignment: go.TreeAlignment.Start,
            compaction: go.TreeCompaction.None,
            layerSpacing: 16,
            layerSpacingParentOverlap: 1,
            nodeIndentPastParent: 1,
            nodeSpacing: 0,
            portSpot: go.Spot.Bottom,
            childPortSpot: go.Spot.Left,
            arrangementSpacing: new go.Size(0, 0),
            commitNodes: function () {
                go.TreeLayout.prototype.commitNodes.call(this);
                updateNodeWidths(400);
            }
        });
        myTasks.mouseLeave = (e, node) => (myHighlightTask.visible = false);
        myTasks.animationManager.isInitial = false;
        myTasks.addDiagramListener("TreeCollapsed", (e) => myGantt.layoutDiagram(true));
        myTasks.addDiagramListener("TreeExpanded", (e) => myGantt.layoutDiagram(true));
        myTasks.addDiagramListener("ChangedSelection", (e) => {
            if (myChangingSelection) return;
            myChangingSelection = true;
            const tasks: go.Node[] = [];
            e.diagram.selection.each((part) => {
                if (part instanceof go.Node) {
                    const ganttNode = myGantt.findNodeForData(part.data);
                    if (ganttNode) tasks.push(ganttNode);
                }
            });
            myGantt.selectCollection(tasks);
            myChangingSelection = false;
        });

        myTasks.nodeTemplate = new go.Node('Table', {
            columnSizing: go.Sizing.None,
            selectionAdorned: false,
            height: GridCellHeight,
            mouseEnter: (e, node) => {
                node.background = 'rgba(0,0,255,0.2)';
                myHighlightTask.position = new go.Point(myGrid.actualBounds.x, node.actualBounds.y);
                myHighlightTask.width = myGrid.actualBounds.width;
                myHighlightTask.visible = true;
            },
            mouseLeave: (e, node) => {
                node.background = node.isSelected ? 'dodgerblue' : 'transparent';
                myHighlightTask.visible = false;
            },
            doubleClick: (e, node) => {
                const bar = myGantt.findNodeForData(node.data);
                if (bar) myGantt.commandHandler.scrollToPart(bar);
            },
            ...standardContextMenus()
        })
        .bind(new go.Binding('background', 'isSelected', (s) => (s ? 'dodgerblue' : 'transparent')).makeTwoWay())
        .bind(new go.Binding('isTreeExpanded').makeTwoWay())
        .addColumnDefinition(0, { width: 14 })
        .addColumnDefinition(1, { alignment: go.Spot.Left })
        .addColumnDefinition(2, {
            width: 40,
            alignment: go.Spot.Right,
            separatorPadding: new go.Margin(0, 4),
            separatorStroke: 'gray'
        })
        .addColumnDefinition(3, {
            width: 40,
            alignment: go.Spot.Right,
            separatorPadding: new go.Margin(0, 4),
            separatorStroke: 'gray'
        })
        .add(
            go.GraphObject.build('TreeExpanderButton', { column: 0, portId: '', scale: 0.85 }),
            new go.TextBlock({ column: 1, editable: true })
            .bind(new go.Binding('text').makeTwoWay()),
            new go.TextBlock({ column: 2 })
            .bind('text', 'start', (s) => s.toFixed(2)),
            new go.TextBlock({ column: 3 })
            .bind('text', 'duration', (d) => d.toFixed(2))
        );

        var TREEWIDTH = 160;

        function updateNodeWidths(width: number) {
            let minx = Infinity;
            myTasks.nodes.each((n) => {
                if (n instanceof go.Node) {
                    minx = Math.min(minx, n.actualBounds.x);
                }
            });
            if (minx === Infinity) return;
            const right = minx + width;
            myTasks.nodes.each((n) => {
                if (n instanceof go.Node) {
                    n.width = Math.max(0, right - n.actualBounds.x);
                    const col1 = n.getColumnDefinition(1);
                    if (col1) col1.width = TREEWIDTH - n.actualBounds.x;
                }
            });
            const headerCol1 = myTasksHeader.getColumnDefinition(1);
            if(headerCol1) headerCol1.width = TREEWIDTH - myTasksHeader.actualBounds.x;
        }

        const myTasksHeader = new go.Part('Table', {
            layerName: 'Adornment',
            pickable: false,
            position: new go.Point(-26, 0),
            columnSizing: go.Sizing.None,
            selectionAdorned: false,
            height: GridCellHeight,
            background: 'lightgray'
        })
        .addColumnDefinition(0, { width: 14 })
        .addColumnDefinition(1)
        .addColumnDefinition(2, { width: 40, alignment: go.Spot.Right, separatorPadding: new go.Margin(0, 4), separatorStroke: 'gray' })
        .addColumnDefinition(3, { width: 40, alignment: go.Spot.Right, separatorPadding: new go.Margin(0, 4), separatorStroke: 'gray' })
        .add(
            new go.TextBlock('Name', { column: 1 }),
            new go.TextBlock('Start', { column: 2 }),
            new go.TextBlock('Dur.', { column: 3 })
        );
        myTasks.add(myTasksHeader);

        myTasks.linkTemplate = new go.Link({
            selectable: false,
            routing: go.Routing.Orthogonal,
            fromEndSegmentLength: 1,
            toEndSegmentLength: 1
        }).add(new go.Shape());

        myTasks.linkTemplateMap.add('Dep', new go.Link({
            selectable: false,
            visible: false,
            isTreeLink: false
        }));
        
        // Gantt chart setup
        myGantt.initialPosition = new go.Point(-10, -100);
        myGantt.padding = new go.Margin(TimelineHeight + 4, GridCellWidth * 7, GridCellHeight, 0);
        myGantt.scrollMargin = new go.Margin(0, GridCellWidth * 7, 0, 0);
        myGantt.allowCopy = false;
        myGantt.commandHandler.deletesTree = true;
        myGantt.toolManager.draggingTool.isGridSnapEnabled = true;
        myGantt.toolManager.draggingTool.gridSnapCellSize = new go.Size(GridCellWidth, GridCellHeight);
        myGantt.toolManager.draggingTool.dragsTree = true;
        myGantt.toolManager.resizingTool.isGridSnapEnabled = true;
        myGantt.toolManager.resizingTool.cellSize = new go.Size(GridCellWidth, GridCellHeight);
        myGantt.toolManager.resizingTool.minSize = new go.Size(GridCellWidth, GridCellHeight);
        myGantt.layout = new GanttLayout(null);
        myGantt.mouseOver = (e) => {
            if (!myGrid || !myHighlightDay) return;
            const lp = myGrid.getLocalPoint(e.documentPoint);
            const day = Math.floor(convertXToStart(lp.x, null));
            myHighlightDay.position = new go.Point(convertStartToX(day), myGrid.position.y);
            myHighlightDay.width = GridCellWidth;
            myHighlightDay.height = myGrid.actualBounds.height;
            myHighlightDay.visible = true;
        };
        myGantt.mouseLeave = (e) => (myHighlightDay.visible = false);
        myGantt.animationManager.isInitial = false;
        myGantt.addDiagramListener("SelectionMoved", (e) => e.diagram.layoutDiagram(true));
        myGantt.addDiagramListener("DocumentBoundsChanged", (e) => {
            const b = e.diagram.documentBounds;
            myGrid.desiredSize = new go.Size(b.width + GridCellWidth * 7, b.bottom);
            myTimeline.graduatedMax = Math.ceil(b.width / (GridCellWidth * 7)) * (GridCellWidth * 7);
            const mainShape = myTimeline.findObject('MAIN');
            if (mainShape) mainShape.width = myTimeline.graduatedMax;
            const ticksShape = myTimeline.findObject('TICKS');
            if(ticksShape) ticksShape.height = Math.max(e.diagram.documentBounds.height, e.diagram.viewportBounds.height);
        });
        myGantt.addDiagramListener("ChangedSelection", (e) => {
            if (myChangingSelection) return;
            myChangingSelection = true;
            const bars: go.Node[] = [];
            e.diagram.selection.each((part) => {
                if (part instanceof go.Node) {
                    const taskNode = myTasks.findNodeForData(part.data);
                    if(taskNode) bars.push(taskNode);
                }
            });
            myTasks.selectCollection(bars);
            myChangingSelection = false;
        });

        const myTimeline = new go.Part('Graduated', {
            layerName: 'Adornment',
            pickable: false,
            position: new go.Point(-26, 0),
            graduatedTickUnit: GridCellWidth
        }).add(
            new go.Shape('LineH', { name: 'MAIN', strokeWidth: 0, height: TimelineHeight, background: 'lightgray' }),
            new go.Shape('LineV', { name: 'TICKS', interval: 7, alignmentFocus: new go.Spot(0.5, 0, 0, -TimelineHeight / 2), stroke: 'lightgray', strokeWidth: 0.5 }),
            new go.TextBlock({
                alignmentFocus: go.Spot.Left,
                interval: 7,
                graduatedFunction: valueToText,
                graduatedSkip: (val, tb) => val > tb.panel.graduatedMax - GridCellWidth * 7
            })
        );
        myGantt.add(myTimeline);

        const myGrid = new go.Part('Grid', {
            layerName: 'Grid',
            pickable: false,
            position: new go.Point(0, 0),
            gridCellSize: new go.Size(3000, GridCellHeight)
        }).add(new go.Shape('LineH', { strokeWidth: 0.5 }));
        myGantt.add(myGrid);

        const myHighlightDay = new go.Part({
            layerName: 'Grid',
            visible: false,
            pickable: false,
            background: 'rgba(255,0,0,0.2)',
            position: new go.Point(0, 0),
            width: GridCellWidth,
            height: GridCellHeight
        });
        myGantt.add(myHighlightDay);

        const myHighlightTask = new go.Part({
            layerName: 'Grid',
            visible: false,
            pickable: false,
            background: 'rgba(0,0,255,0.2)',
            position: new go.Point(0, 0),
            width: GridCellWidth,
            height: GridCellHeight
        });
        myGantt.add(myHighlightTask);

        myGantt.nodeTemplate = new go.Node('Spot', {
            selectionAdorned: false,
            selectionChanged: (node) => {
                node.diagram?.commit((diag) => {
                    const shape = node.findObject('SHAPE');
                    if (shape) shape.fill = node.isSelected ? 'dodgerblue' : (node.data && node.data.color) || 'gray';
                }, null);
            },
            minLocation: new go.Point(0, NaN),
            maxLocation: new go.Point(Infinity, NaN),
            toolTip: go.GraphObject.build('ToolTip',
                new go.Panel('Table', { defaultAlignment: go.Spot.Left })
                .addColumnDefinition(1, { separatorPadding: 3 })
                .add(
                    new go.TextBlock({ row: 0, column: 0, columnSpan: 9, font: 'bold 12pt sans-serif' }).bind('text'),
                    new go.TextBlock({ row: 1, column: 0 }, 'start:'),
                    new go.TextBlock({ row: 1, column: 1 }).bind('text', 'start', (d) => 'day ' + convertUnitsToDays(d).toFixed(0)),
                    new go.TextBlock({ row: 2, column: 0 }, 'length:'),
                    new go.TextBlock({ row: 2, column: 1 }).bind('text', 'duration', (d) => convertUnitsToDays(d).toFixed(0) + ' days')
                )
            ),
            resizable: true,
            resizeObjectName: 'SHAPE',
            resizeAdornmentTemplate: new go.Adornment('Spot')
                .add(
                    new go.Placeholder(),
                    new go.Shape('Diamond', { alignment: go.Spot.Right, width: 8, height: 8, strokeWidth: 0, fill: 'fuchsia', cursor: 'e-resize' })
                ),
            mouseOver: (e, node) => myGantt.mouseOver(e),
            ...standardContextMenus()
        })
        .bind(new go.Binding('position', 'start', convertStartToPosition, convertPositionToStart).makeTwoWay())
        .bind(new go.Binding('resizable', 'isTreeLeaf'))
        .bind(new go.Binding('isTreeExpanded').makeTwoWay())
        .add(
            new go.Shape({ name: 'SHAPE', height: 18, margin: new go.Margin(1, 0), strokeWidth: 0, fill: 'gray' })
            .bind(new go.Binding('fill', 'color'))
            .bind(new go.Binding('width', 'duration', convertDurationToW, convertWToDuration).makeTwoWay())
            .bind(new go.Binding('figure', 'isTreeLeaf', (leaf) => (leaf ? 'Rectangle' : 'RangeBar'))),
            new go.TextBlock({ font: '8pt sans-serif', alignment: go.Spot.TopLeft, alignmentFocus: new go.Spot(0, 0, 0, -2) })
            .bind(new go.Binding('text'))
            .bind(new go.Binding('stroke', 'color', (c) => (go.Brush.isDark(c) ? '#DDDDDD' : '#333333')))
        );
        
        myGantt.linkTemplate = new go.Link({ visible: false });

        myGantt.linkTemplateMap.add('Dep', new go.Link({
            routing: go.Routing.Orthogonal,
            isTreeLink: false,
            isLayoutPositioned: false,
            fromSpot: new go.Spot(0.999999, 1),
            toSpot: new go.Spot(0.000001, 0)
        }).add(
            new go.Shape({ stroke: 'brown', strokeWidth: 3 }),
            new go.Shape({ toArrow: 'Standard', fill: 'brown', strokeWidth: 0, scale: 0.75 })
        ));

        // Shared Model
        const myModel = new go.GraphLinksModel({
            linkKeyProperty: 'key',
            modelData: { origin: 1531540800000 },
            nodeDataArray: [
                { key: 0, text: 'Project X' },
                { key: 1, text: 'Task 1', color: 'darkgreen' },
                { key: 11, text: 'Task 1.1', color: 'green', duration: convertDaysToUnits(7) },
                { key: 12, text: 'Task 1.2', color: 'green' },
                { key: 121, text: 'Task 1.2.1', color: 'lightgreen', duration: convertDaysToUnits(3) },
                { key: 122, text: 'Task 1.2.2', color: 'lightgreen', duration: convertDaysToUnits(5) },
                { key: 123, text: 'Task 1.2.3', color: 'lightgreen', duration: convertDaysToUnits(4) },
                { key: 2, text: 'Task 2', color: 'darkblue' },
                { key: 21, text: 'Task 2.1', color: 'blue', duration: convertDaysToUnits(15), start: convertDaysToUnits(10) },
                { key: 22, text: 'Task 2.2', color: 'goldenrod' },
                { key: 221, text: 'Task 2.2.1', color: 'yellow', duration: convertDaysToUnits(8) },
                { key: 222, text: 'Task 2.2.2', color: 'yellow', duration: convertDaysToUnits(6) },
                { key: 23, text: 'Task 2.3', color: 'darkorange' },
                { key: 231, text: 'Task 2.3.1', color: 'orange', duration: convertDaysToUnits(11) }
            ],
            linkDataArray: [
                { key: '0_1', from: 0, to: 1 }, { key: '1_11', from: 1, to: 11 }, { key: '1_12', from: 1, to: 12 }, { key: '12_121', from: 12, to: 121 }, { key: '12_122', from: 12, to: 122 }, { key: '12_123', from: 12, to: 123 },
                { key: '0_2', from: 0, to: 2 }, { key: '2_21', from: 2, to: 21 }, { key: '2_22', from: 2, to: 22 }, { key: '22_221', from: 22, to: 221 }, { key: '22_222', from: 22, to: 222 }, { key: '2_23', from: 2, to: 23 }, { key: '23_231', from: 23, to: 231 },
                { key: '11_2', from: 11, to: 2, category: 'Dep' }
            ]
        });

        StartDate = new Date(myModel.modelData.origin);
        myModel.undoManager.isEnabled = true;
        myTasks.model = myModel;
        myGantt.model = myModel;

        myModel.addChangedListener((e) => {
            if (e.isTransactionFinished) {
                setModelText(e.model.toJson());
            }
        });
        
        // Sync viewports
        var changingView = false;
        myTasks.addDiagramListener('ViewportBoundsChanged', (e) => {
            if (changingView) return;
            changingView = true;
            myTasksHeader.position = new go.Point(myTasksHeader.position.x, myTasks.viewportBounds.position.y);
            myGantt.scale = myTasks.scale;
            myGantt.position = new go.Point(myGantt.position.x, myTasks.position.y);
            myTimeline.position = new go.Point(myTimeline.position.x, myGantt.viewportBounds.position.y);
            changingView = false;
        });
        myGantt.addDiagramListener('ViewportBoundsChanged', (e) => {
            if (changingView) return;
            changingView = true;
            myTasks.scale = myGantt.scale;
            myTasks.position = new go.Point(myTasks.position.x, myGantt.position.y);
            myTasksHeader.position = new go.Point(myTasksHeader.position.x, myTasks.viewportBounds.position.y);
            const ganttPos = myGantt.position;
            const tasksPos = myTasks.position;
            if (ganttPos.y !== tasksPos.y) {
                 myGantt.position = new go.Point(ganttPos.x, tasksPos.y);
            }
            myTimeline.position = new go.Point(myTimeline.position.x, myGantt.viewportBounds.position.y);
            changingView = false;
        });

    }, []);

    const handleRescale = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        const myGantt = ganttRef.current?.getDiagram();
        if(!myGantt) return;
        myGantt.commit((diag) => {
            GridCellWidth = val;
            diag.scrollMargin = new go.Margin(0, GridCellWidth * 7, 0, 0);
            diag.toolManager.draggingTool.gridSnapCellSize = new go.Size(GridCellWidth, 20);
            diag.toolManager.resizingTool.cellSize = new go.Size(GridCellWidth, 20);
            diag.toolManager.resizingTool.minSize = new go.Size(GridCellWidth, 20);
            diag.updateAllTargetBindings();
            if (diag.layout instanceof go.Layout) {
                (diag.layout as any).cellHeight = 20;
            }
            diag.layoutDiagram(true);
            const timeline = diag.findObject("myTimeline");
            if(timeline instanceof go.Part) (timeline as any).graduatedTickUnit = GridCellWidth;
            diag.padding = new go.Margin(24 + 4, GridCellWidth * 7, 20, 0);

            const myTasks = tasksRef.current?.getDiagram();
            if(myTasks) myTasks.padding = new go.Margin(24 + 4, 0, 20, 0);
        }, null);
    };

    return (
        <div>
            <div style={{ display: 'flex' }}>
                <div style={{ border: 'solid 1px black', width: '30%' }}>
                    <ReactDiagram
                        ref={tasksRef}
                        divClassName='diagram-component'
                        initDiagram={() => new go.Diagram()}
                        nodeDataArray={[]}
                        linkDataArray={[]}
                    />
                </div>
                <div style={{ border: 'solid 1px black', width: '70%' }}>
                    <ReactDiagram
                        ref={ganttRef}
                        divClassName='diagram-component'
                        initDiagram={() => new go.Diagram()}
                        nodeDataArray={[]}
                        linkDataArray={[]}
                    />
                </div>
            </div>
            <div>
                <label>Width of Day:
                <input id="widthSlider" type="range" min="1" max="50" defaultValue="12" onChange={handleRescale} />
                </label>
            </div>
            <textarea
                id="mySavedModel"
                style={{ width: '100%', height: '200px', background: '#f0f0f0', border: '1px solid #ccc' }}
                value={modelText}
                readOnly
            />
        </div>
    );
};

export default GoGanttChart;

    