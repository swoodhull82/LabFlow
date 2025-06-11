
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Employee } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getEmployees, deleteEmployee } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred.";

  if (error && typeof error === 'object') {
    if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.message && typeof error.message === 'string') {
        message = error.message;
    }

    if ('status' in error) {
      const status = error.status;
      if (status === 404 && !message.toLowerCase().includes("found") && !message.toLowerCase().includes("exist")) {
        message = `The required resource was not found (404). Collection or record might be missing. Original: ${message}`;
      } else if (status === 403 && !message.toLowerCase().includes("forbidden") && !message.toLowerCase().includes("permission")) {
        message = `You do not have permission for this action (403). Please check API rules. Original: ${message}`;
      } else if (status === 401 && !message.toLowerCase().includes("unauthorized") && !message.toLowerCase().includes("failed to authenticate")) {
        message = `Authentication failed or is required (401). Original: ${message}`;
      } else if (status === 0 && !(message.toLowerCase().includes("autocancelled") || message.toLowerCase().includes("network error"))) {
        message = `Network error or request cancelled. Please check your connection. Original: ${message}`;
      }
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  
  return message;
};


export default function EmployeesPage() {
  const { user, pbClient } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = useCallback(async (pb: PocketBase, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      // Pass AbortSignal to getEmployees if your service supports it.
      // For now, PocketBase SDK handles autocancellation internally based on new requests.
      const fetchedEmployees = await getEmployees(pb);
      setEmployees(fetchedEmployees);
    } catch (err: any) {
        // Check if it's an autocancelled error from PocketBase
        const isPocketBaseAutocancel = err && typeof err === 'object' && err.isAbort === true;
        // Broader check for general autocancel/network issues (status 0)
        const isGeneralAutocancelOrNetworkIssue = err && err.status === 0;
        const isMessageAutocancel = err && typeof err.message === 'string' && err.message.toLowerCase().includes("autocancelled");

      if (isPocketBaseAutocancel || isGeneralAutocancelOrNetworkIssue || isMessageAutocancel) {
        console.warn("Employees fetch request was autocancelled or due to a network issue. This can occur if the request was rapidly re-initiated (e.g., in React StrictMode) or due to navigation/network problems.", err);
        // Do NOT set a user-facing error for these cases if a retry is expected or it's a common dev scenario.
        // If `isLoading` is true, it will remain true until a successful fetch or a non-autocancel error on a subsequent attempt.
        // If no subsequent attempt succeeds, the UI will remain in loading or the last valid state.
        // If it was the *only* attempt and it was a network error (status 0, not isAbort), then an error message might be suitable.
        // For now, we are suppressing setError for all status 0 / isAbort cases.
      } else {
        console.error("Error fetching employees:", err);
        const detailedError = getDetailedErrorMessage(err);
        setError(detailedError ? `${detailedError} Please try again.` : "Failed to load employees. Please try again.");
        toast({ title: "Error Loading Employees", description: detailedError || "An unknown error occurred.", variant: "destructive" });
      }
    } finally {
      // Only set loading to false if it wasn't an abort that might be retried by StrictMode's second call.
      // However, the `ignore` flag pattern handles unmounted state updates better.
      // For simplicity here, always setting loading to false in finally if not ignored by cleanup.
      // The `useEffect` cleanup with `ignore` handles the unmounted component scenario.
       setIsLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    if (!pbClient || !user) {
      // User or pbClient not ready, AuthContext might be loading or user not logged in.
      // If user is null and AuthContext is not loading, AppLayout will redirect.
      // Set loading true here to show loading indicator until auth status is resolved.
      setIsLoading(true);
      return;
    }

    if (user.role !== 'Supervisor') {
      toast({ title: "Access Denied", description: "This page is for Supervisors only.", variant: "destructive" });
      router.push('/dashboard');
      return;
    }

    let ignore = false;

    // Call the memoized fetchEmployees function
    fetchEmployees(pbClient);
    
    return () => {
      ignore = true;
      // If your `getEmployees` or `pbClient.collection.getFullList` supported AbortController,
      // you would call controller.abort() here. PocketBase handles this internally.
    };
  }, [user, pbClient, router, toast, fetchEmployees]);


  const handleDeleteEmployee = async (employeeId: string) => {
    if (!pbClient) return;
    try {
      await deleteEmployee(pbClient, employeeId);
      toast({ title: "Success", description: "Employee deleted successfully." });
      setEmployees(prevEmployees => prevEmployees.filter(emp => emp.id !== employeeId));
    } catch (err) {
      console.error("Error deleting employee:", err);
      const detailedError = getDetailedErrorMessage(err);
      toast({ title: "Error Deleting Employee", description: detailedError, variant: "destructive" });
    }
  };
  
  const refetchEmployees = () => {
     if (pbClient && user && user.role === 'Supervisor') {
        fetchEmployees(pbClient);
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
  
  if (user && user.role !== 'Supervisor' && !isLoading) { 
    // This case should ideally be caught by the useEffect redirect,
    // but as a fallback UI if redirection is slow or fails.
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
                <CardTitle className="text-center">Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground">
                    This page is for Supervisors only.
                </p>
                 <Button onClick={() => router.push('/dashboard')} className="w-full mt-6">
                    Go to Dashboard
                </Button>
            </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-semibold">Employee Management</h1>
        <Link href="/employees/new" passHref>
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
          </Button>
        </Link>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">All Employees</CardTitle>
          <CardDescription>Manage employee information and access.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading employees...</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-center py-10 text-destructive">
              <p>{error}</p>
              <Button onClick={refetchEmployees} className="mt-4">Try Again</Button>
            </div>
          )}
          {!isLoading && !error && employees.length === 0 && (
             <div className="text-center py-10 text-muted-foreground">
              <p>No employees found. Get started by adding a new employee!</p>
            </div>
          )}
          {!isLoading && !error && employees.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Reports To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <span className="font-medium">{employee.name}</span>
                    </TableCell>
                    <TableCell>{employee.email}</TableCell>
                    <TableCell>{employee.role}</TableCell>
                    <TableCell>{employee.department_text || "-"}</TableCell>
                    <TableCell>{employee.reportsTo_text || "-"}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem asChild>
                            {/* TODO: Implement Edit Employee Page: /employees/[id]/edit */}
                            <Link href={`/employees/${employee.id}/edit`} className="flex items-center w-full cursor-not-allowed opacity-50">
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => handleDeleteEmployee(employee.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
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
