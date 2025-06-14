
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { getActivityLogEntries } from "@/services/activityLogService";
import type { ActivityLogEntry } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import type PocketBase from "pocketbase";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred while fetching the activity log.";
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = "Failed to load activity log: Could not connect to the server. Please check your internet connection and try again.";
    } else if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
        message = error.originalError.message;
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }
    if ('status' in error && error.status !== 0) { 
      const status = error.status;
      if (status === 404) message = `The activity log collection was not found (404). Original: ${message}`;
      else if (status === 403) message = `You do not have permission to view the activity log (403). Original: ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

export default function ActivityLogPage() {
  const { user, pbClient } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [logEntries, setLogEntries] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewPage = user?.role === 'Supervisor';

  const fetchLogEntries = useCallback(async (pb: PocketBase, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const entries = await getActivityLogEntries(pb, { signal });
      setLogEntries(entries);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`Activity log fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Activity Log", description: detailedError, variant: "destructive" });
        console.warn("Activity log fetch (network error):", detailedError, err);
      } else {
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError);
        toast({ title: "Error Loading Activity Log", description: detailedError, variant: "destructive" });
        console.warn("Error fetching activity log (after retries):", detailedError, err); 
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!pbClient || !user) {
      setIsLoading(true);
      return;
    }

    if (!canViewPage) {
      toast({ title: "Access Denied", description: "This page is for Supervisors only.", variant: "destructive" });
      router.push('/dashboard');
      return;
    }
    const controller = new AbortController();
    fetchLogEntries(pbClient, controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [user, pbClient, router, toast, fetchLogEntries, canViewPage]);

  const refetchLogs = () => {
    if (pbClient && canViewPage) {
      fetchLogEntries(pbClient); // Consider AbortController if this can be rapid-clicked
    }
  };

  if (!user && isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user information...</p>
      </div>
    );
  }

  if (user && !canViewPage && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-center">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">This page is for Supervisors only.</p>
            <Button onClick={() => router.push('/dashboard')} className="w-full mt-6">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-headline font-semibold">Activity Log</h1>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Log Entries</CardTitle>
          <CardDescription>Recent activities within the application.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading activity log...</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-center py-10 text-destructive">
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">Failed to Load Activity Log</p>
              <p className="text-sm">{error}</p>
              <Button onClick={refetchLogs} className="mt-6">Try Again</Button>
            </div>
          )}
          {!isLoading && !error && logEntries.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <p>No activity log entries found.</p>
            </div>
          )}
          {!isLoading && !error && logEntries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logEntries.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      {format(new Date(entry.created), "MMM dd, yyyy, hh:mm:ss a")}
                    </TableCell>
                    <TableCell>{entry.user_name}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell>{entry.details || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
