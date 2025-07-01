
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { add, format, startOfWeek, eachDayOfInterval, isToday, getHours, getMinutes } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { CalendarEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

// Constants for the view
const START_HOUR = 6; // 6 AM
const END_HOUR = 17; // 5 PM (ends at 17:00)
const HOUR_HEIGHT_PX = 80; // Height of one hour slot in pixels

const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
    const hour = i + START_HOUR;
    if (hour === 12) return '12 PM';
    if (hour > 12) return `${hour - 12} PM`;
    return `${hour} AM`;
});

const getPriorityColorClass = (priority?: string): string => {
  if (!priority) return "border-gray-400 bg-gray-50 dark:bg-gray-700/20";
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return "border-red-500 bg-red-50 dark:bg-red-900/20";
    case "high": return "border-orange-500 bg-orange-50 dark:bg-orange-900/20";
    case "medium": return "border-blue-500 bg-blue-50 dark:bg-blue-900/20";
    case "low": return "border-green-500 bg-green-50 dark:bg-green-900/20";
    default: return "border-gray-400 bg-gray-50 dark:bg-gray-700/20";
  }
};

const NowIndicator = ({ dayColumns }: { dayColumns: Date[] }) => {
    const [now, setNow] = useState(new Date());
    const todayColumnIndex = dayColumns.findIndex(day => isToday(day));

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 60 * 1000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    if (todayColumnIndex === -1) {
        return null; // Don't show if today is not in the current view (e.g., weekend)
    }
    
    const hoursFromStart = getHours(now) + getMinutes(now) / 60 - START_HOUR;
    if (hoursFromStart < 0 || hoursFromStart > (END_HOUR - START_HOUR)) {
        return null; // Don't show if current time is outside business hours
    }

    const topPosition = hoursFromStart * HOUR_HEIGHT_PX;
    const leftPosition = `calc(${todayColumnIndex * 20}% - 1px)`; // 100% / 5 columns = 20% per column

    return (
        <div className="absolute w-full pointer-events-none z-10" style={{ left: leftPosition, top: `${topPosition}px`, width: '20%' }}>
            <div className="relative h-px bg-destructive w-full">
                <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-destructive"></div>
            </div>
        </div>
    );
};


interface WeeklyViewProps {
    events: CalendarEvent[];
}

export default function WeeklyView({ events }: WeeklyViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const containerRef = useRef<HTMLDivElement>(null);

    // Scroll to 8 AM on initial load
    useEffect(() => {
        if (containerRef.current) {
            // 8 AM is 2 hours after start hour (6 AM)
            const scrollToPosition = 2 * HOUR_HEIGHT_PX;
            containerRef.current.scrollTop = scrollToPosition;
        }
    }, []);

    const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const daysInWeek = eachDayOfInterval({
        start: startOfCurrentWeek,
        end: add(startOfCurrentWeek, { days: 4 }), // Monday to Friday
    });

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        daysInWeek.forEach(day => {
            map.set(format(day, 'yyyy-MM-dd'), []);
        });
        events.forEach(event => {
            if (event.eventDate) {
                const eventDate = new Date(event.eventDate);
                const eventDayStr = format(eventDate, 'yyyy-MM-dd');
                if(map.has(eventDayStr)) {
                    map.get(eventDayStr)?.push(event);
                }
            }
        });
        // Sort events within each day by time
        map.forEach((dayEvents) => {
            dayEvents.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
        });
        return map;
    }, [events, daysInWeek]);

    const handlePrevWeek = () => {
        setCurrentDate(current => add(current, { weeks: -1 }));
    };
    
    const handleNextWeek = () => {
        setCurrentDate(current => add(current, { weeks: 1 }));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    }

    return (
        <Card className="shadow-md overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b">
                 <h2 className="text-lg font-semibold">{format(startOfCurrentWeek, 'MMMM yyyy')}</h2>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" onClick={handlePrevWeek}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={handleNextWeek}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>
            <div className="flex" style={{ height: 'calc(100vh - 300px)' }}>
                {/* Time Gutter */}
                <div className="w-16 flex-shrink-0 text-right">
                     <div className="h-16 sticky top-0 bg-card z-20" />
                     <div className="relative">
                        {hours.map(hour => (
                            <div key={hour} className="h-[--hour-height] flex items-start justify-end pr-2" style={{'--hour-height': `${HOUR_HEIGHT_PX}px`} as React.CSSProperties}>
                                <span className="relative -top-2.5 text-xs text-muted-foreground">{hour}</span>
                            </div>
                         ))}
                    </div>
                </div>

                {/* Main Calendar Grid */}
                <div ref={containerRef} className="flex-grow overflow-y-auto">
                    <div className="grid grid-cols-5 sticky top-0 bg-card z-20 border-b">
                        {daysInWeek.map(day => (
                            <div key={day.toString()} className="h-16 flex flex-col items-center justify-center border-l">
                                <p className="text-sm text-muted-foreground">{format(day, 'EEE')}</p>
                                <p className={cn("text-2xl font-semibold", isToday(day) && 'text-primary')}>{format(day, 'd')}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-5 relative">
                        {/* Hour background lines */}
                        <div className="col-span-full grid grid-rows-[repeat(11,minmax(0,1fr))]">
                             {hours.map((_, index) => (
                                <div key={index} className="h-[--hour-height] border-b" style={{'--hour-height': `${HOUR_HEIGHT_PX}px`} as React.CSSProperties}></div>
                            ))}
                        </div>
                        {/* Day vertical lines and events */}
                        {daysInWeek.map((day) => (
                            <div key={`col-${day.toString()}`} className="relative border-l">
                                {(eventsByDay.get(format(day, 'yyyy-MM-dd')) || []).map(event => {
                                    const eventDate = new Date(event.eventDate);
                                    const hoursFromStart = getHours(eventDate) + getMinutes(eventDate) / 60 - START_HOUR;
                                    const top = hoursFromStart * HOUR_HEIGHT_PX;

                                    // Default duration of 1 hour for display
                                    const durationHours = 1;
                                    const height = durationHours * HOUR_HEIGHT_PX - 4; // -4 for padding

                                    if (top < 0 || top > ((END_HOUR - START_HOUR) * HOUR_HEIGHT_PX)) return null;

                                    return (
                                        <div 
                                            key={event.id}
                                            className={cn(
                                                "absolute left-1 right-1 p-2 rounded-lg cursor-pointer transition-all shadow-sm hover:shadow-md",
                                                getPriorityColorClass(event.priority),
                                                "border-l-4"
                                            )}
                                            style={{ top: `${top}px`, height: `${height}px`}}
                                            title={`${event.title} - ${format(eventDate, 'h:mm a')}`}
                                        >
                                            <p className="font-semibold text-sm truncate text-foreground">{event.title}</p>
                                            <p className="text-xs text-muted-foreground">{format(eventDate, 'h:mm a')}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}

                        {/* Now indicator overlay */}
                        <div className="absolute inset-0 col-span-full">
                            <NowIndicator dayColumns={daysInWeek} />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
