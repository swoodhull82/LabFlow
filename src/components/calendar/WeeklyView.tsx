
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { add, format, startOfWeek, eachDayOfInterval, isToday, getHours, getMinutes, differenceInMinutes, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
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
  if (!priority) return "border-gray-300 bg-gray-50 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200";
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return "border-red-500 bg-red-50 text-red-900 dark:bg-red-900/20 dark:border-red-500/70 dark:text-red-100";
    case "high": return "border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:border-orange-500/70 dark:text-orange-100";
    case "medium": return "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:border-blue-500/70 dark:text-blue-100";
    case "low": return "border-green-500 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-500/70 dark:text-green-100";
    default: return "border-gray-300 bg-gray-50 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200";
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
        return null; // Don't show if today is not in the current view
    }
    
    const hoursFromStart = getHours(now) + getMinutes(now) / 60 - START_HOUR;
    if (hoursFromStart < 0 || hoursFromStart > (END_HOUR - START_HOUR)) {
        return null; // Don't show if current time is outside business hours
    }

    const topPosition = hoursFromStart * HOUR_HEIGHT_PX;

    return (
        <div className="absolute pointer-events-none z-20" style={{ left: `calc(${todayColumnIndex * (100 / dayColumns.length)}%)`, top: `${topPosition}px`, width: `${100/dayColumns.length}%` }}>
            <div className="relative h-px bg-destructive w-full">
                <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-destructive"></div>
            </div>
        </div>
    );
};


interface WeeklyViewProps {
    events: CalendarEvent[];
    onHourSlotClick: (date: Date) => void;
}

export default function WeeklyView({ events, onHourSlotClick }: WeeklyViewProps) {
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
            if (event.startDate) {
                const eventDate = new Date(event.startDate);
                 if (!isValid(eventDate)) return;
                const eventDayStr = format(eventDate, 'yyyy-MM-dd');
                if(map.has(eventDayStr)) {
                    map.get(eventDayStr)?.push(event);
                }
            }
        });
        // Sort events within each day by time
        map.forEach((dayEvents) => {
            dayEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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
                     <div className="h-16 sticky top-0 bg-card z-30" />
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
                    <div className="grid grid-cols-5 sticky top-0 bg-card z-30 border-b">
                        {daysInWeek.map(day => (
                            <div key={day.toString()} className="h-16 flex flex-col items-center justify-center border-l">
                                <p className="text-sm text-muted-foreground">{format(day, 'EEE')}</p>
                                <p className={cn("text-2xl font-semibold", isToday(day) && 'text-primary')}>{format(day, 'd')}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-5 relative">
                        {/* Day columns with slots and events */}
                        {daysInWeek.map((day, dayIndex) => (
                            <div key={`col-${day.toString()}`} className="relative border-l">
                                {/* Clickable Hour Slots */}
                                <div className="absolute inset-0 z-0">
                                    {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourIndex) => {
                                        const hour = START_HOUR + hourIndex;
                                        const slotDate = new Date(day);
                                        slotDate.setHours(hour, 0, 0, 0);

                                        return (
                                            <div
                                                key={`${dayIndex}-${hourIndex}`}
                                                onClick={() => onHourSlotClick(slotDate)}
                                                className="h-[--hour-height] border-b border-border/20 transition-colors hover:bg-primary/10 cursor-pointer"
                                                style={{'--hour-height': `${HOUR_HEIGHT_PX}px`} as React.CSSProperties}
                                            ></div>
                                        );
                                    })}
                                </div>
                                
                                {/* Events positioned on top */}
                                {(eventsByDay.get(format(day, 'yyyy-MM-dd')) || []).map(event => {
                                    const startDate = new Date(event.startDate);
                                    const endDate = new Date(event.endDate);

                                    if (!isValid(startDate) || !isValid(endDate)) return null;

                                    const startMinutes = getHours(startDate) * 60 + getMinutes(startDate);
                                    const endMinutes = getHours(endDate) * 60 + getMinutes(endDate);

                                    if (endMinutes < START_HOUR * 60 || startMinutes > END_HOUR * 60) return null;

                                    const topOffsetMinutes = startMinutes - (START_HOUR * 60);
                                    const top = (topOffsetMinutes / 60) * HOUR_HEIGHT_PX;

                                    const durationMinutes = Math.max(30, differenceInMinutes(endDate, startDate));
                                    const height = (durationMinutes / 60) * HOUR_HEIGHT_PX - 2;

                                    return (
                                        <div 
                                            key={event.id}
                                            className={cn(
                                                "absolute left-1 right-1 p-1 rounded-md cursor-pointer transition-all shadow-sm hover:shadow-md overflow-hidden z-10",
                                                getPriorityColorClass(event.priority),
                                                "border-l-4"
                                            )}
                                            style={{ top: `${top}px`, height: `${height}px`}}
                                            title={`${event.title} - ${format(startDate, 'h:mm a')}`}
                                        >
                                            <p className="font-semibold text-xs truncate">{event.title}</p>
                                            <p className="text-[10px] opacity-80">{format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}

                        {/* Now indicator overlay */}
                        <div className="absolute inset-0 col-span-full pointer-events-none z-20">
                            <NowIndicator dayColumns={daysInWeek} />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
