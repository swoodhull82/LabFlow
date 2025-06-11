
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Employee } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployees, deleteEmployee } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";

const getDetailedErrorMessage = (error: any): string => {
  let message = "An unexpected error occurred.";

  // Check for PocketBase ClientResponseError structure or similar error objects
  if (error && typeof error === 'object') {
    if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      // Use the detailed message from PocketBase's response data
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      // Use the error's own message if it's not the generic PocketBase wrapper and more specific
      message = error.message;
    } else if (error.message && typeof error.message === 'string') {
        // Fallback to generic error.message if it exists
        message = error.message;
    }


    // Add more context based on status if the message isn't already informative
    if ('status' in error) {
      const status = error.status;
      if (status === 404 && !message.toLowerCase().includes("found") && !message.toLowerCase().includes("exist")) {
        message = `The required resource was not found (404). Collection or record might be missing. Original: ${message}`;
      } else if (status === 403 && !message.toLowerCase().includes("forbidden") && !message.toLowerCase().includes("permission")) {
        message = `You do not have permission for this action (403). Please check API rules. Original: ${message}`;
      } else if (status === 401 && !message.toLowerCase().includes("unauthorized") && !message.toLowerCase().includes("failed to authenticate")) {
        message = `Authentication failed or is required (401). Original: ${message}`;
      } else if (status === 0 && !(message.toLowerCase().includes("autocancelled") || message.toLowerCase().includes("network error"))) {
         // This case is usually handled by the autocancelled logic, but as a fallback:
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

  useEffect(() => {
    if (user && user.role !== 'Supervisor') {
      router.push('/dashboard');
      return; 
    }

    if (pbClient && user && user.role === 'Supervisor') {
      let ignore = false; 
      
      setIsLoading(true);
      setError(null);
      
      getEmployees(pbClient)
        .then(fetchedEmployees => {
          if (!ignore) {
            setEmployees(fetchedEmployees);
          }
        })
        .catch(err => {
          if (!ignore) {
            if (err && (err.status === 0 || (err.message && err.message.toLowerCase().includes("autocancelled")))) {
              console.warn("Employees fetch request was autocancelled. This can occur if the request was rapidly re-initiated (e.g., in React StrictMode) or due to navigation.", err);
            } else {
              console.error("Error fetching employees:", err);
              const detailedError = getDetailedErrorMessage(err);
              setError(`${detailedError} Please try again.`);
              toast({ title: "Error Loading Employees", description: detailedError, variant: "destructive" });
            }
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoading(false);
          }
        });

      return () => {
        ignore = true; 
      };
    } else if (!user && !pbClient && router) { 
        setIsLoading(true); 
    }
  }, [user, pbClient, router, toast]);


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
        setIsLoading(true);
        setError(null);
        getEmployees(pbClient)
            .then(fetchedEmployees => {
                setEmployees(fetchedEmployees);
            })
            .catch(err_retry => {
                console.error("Error refetching employees:", err_retry);
                const detailedError = getDetailedErrorMessage(err_retry);
                setError(`${detailedError} Please try again.`);
                toast({ title: "Error Refetching Employees", description: detailedError, variant: "destructive" });
            })
            .finally(() => {
                setIsLoading(false);
            });
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
  
  if (user && user.role !== 'Supervisor') { 
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

