
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

export default function EmployeesPage() {
  const { user, pbClient } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    if (!pbClient || (user && user.role !== 'Supervisor')) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedEmployees = await getEmployees(pbClient);
      setEmployees(fetchedEmployees);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setError("Failed to load employees. Please try again.");
      toast({ title: "Error", description: "Failed to load employees.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'Supervisor') {
      router.push('/dashboard'); // Or an unauthorized page
    } else if (pbClient) {
      fetchEmployees();
    }
  }, [user, pbClient, router]);

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!pbClient) return;
    // Optional: Add a confirmation dialog here
    try {
      await deleteEmployee(pbClient, employeeId);
      toast({ title: "Success", description: "Employee deleted successfully." });
      setEmployees(prevEmployees => prevEmployees.filter(emp => emp.id !== employeeId));
    } catch (err) {
      console.error("Error deleting employee:", err);
      toast({ title: "Error", description: "Failed to delete employee.", variant: "destructive" });
    }
  };

  if (!user || user.role !== 'Supervisor') {
    // This should ideally be handled by the redirect, but as a fallback
    return (
      <div className="flex items-center justify-center h-full">
        {user === null && isLoading ? (
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
            <p className="text-destructive">Access Denied. This page is for Supervisors only.</p>
        )}
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
              <Button onClick={fetchEmployees} className="mt-4">Try Again</Button>
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

