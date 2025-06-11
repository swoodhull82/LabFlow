
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Employee } from "@/lib/types";
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getEmployees, deleteEmployee, updateEmployee } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const employeeFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  role: z.string().min(2, { message: "Role must be at least 2 characters." }),
  department_text: z.string().optional(),
  reportsTo_text: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeFormSchema>;

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
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const canManageEmployees = user?.role === 'Supervisor' || user?.role === 'Team Lead';

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "",
      department_text: "",
      reportsTo_text: "",
    },
  });

  const fetchEmployees = useCallback(async (pb: PocketBase) => {
    let ignore = false;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedEmployees = await getEmployees(pb);
      if (!ignore) {
        setEmployees(fetchedEmployees);
      }
    } catch (err: any) {
      if (!ignore) {
        const isPocketBaseAutocancel = err && typeof err === 'object' && err.isAbort === true;
        const isGeneralAutocancelOrNetworkIssue = err && err.status === 0;
        const isMessageAutocancel = err && typeof err.message === 'string' && err.message.toLowerCase().includes("autocancelled");

        if (isPocketBaseAutocancel || isGeneralAutocancelOrNetworkIssue || isMessageAutocancel) {
          console.warn("Employees fetch request was autocancelled or due to a network issue.", err);
          // Don't set error state for autocancelled requests
        } else {
          console.error("Error fetching employees:", err);
          const detailedError = getDetailedErrorMessage(err);
          setError(detailedError ? `${detailedError}` : "Failed to load employees. Please try again.");
          toast({ title: "Error Loading Employees", description: detailedError || "An unknown error occurred.", variant: "destructive" });
        }
      }
    } finally {
       if (!ignore) {
        setIsLoading(false);
       }
    }
    return () => {
      ignore = true;
    };
  }, [toast]);


  useEffect(() => {
    if (!pbClient || !user) {
      setIsLoading(true); // Keep loading if user/client isn't ready
      return;
    }

    if (!canManageEmployees) {
      toast({ title: "Access Denied", description: "This page is for Supervisors and Team Leads only.", variant: "destructive" });
      router.push('/dashboard');
      return;
    }
    
    let ignore = false;
    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedEmployees = await getEmployees(pbClient);
            if (!ignore) {
                setEmployees(fetchedEmployees);
            }
        } catch (err: any) {
             if (!ignore) {
                const isPocketBaseAutocancel = err?.isAbort === true;
                const isGeneralAutocancelOrNetworkIssue = err?.status === 0;
                const isMessageAutocancel = typeof err.message === 'string' && err.message.toLowerCase().includes("autocancelled");

                if (isPocketBaseAutocancel || isGeneralAutocancelOrNetworkIssue || isMessageAutocancel) {
                    console.warn("Employees fetch request was autocancelled or due to a network issue during initial load.", err);
                } else {
                    console.error("Error fetching employees on initial load:", err);
                    const detailedError = getDetailedErrorMessage(err);
                    setError(detailedError || "Failed to load employees.");
                    toast({ title: "Error Loading Employees", description: detailedError || "An unknown error occurred.", variant: "destructive" });
                }
            }
        } finally {
            if (!ignore) {
                setIsLoading(false);
            }
        }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, [user, pbClient, router, toast, canManageEmployees]);

  useEffect(() => {
    if (editingEmployee) {
      form.reset({
        name: editingEmployee.name,
        email: editingEmployee.email,
        role: editingEmployee.role,
        department_text: editingEmployee.department_text || "",
        reportsTo_text: editingEmployee.reportsTo_text || "",
      });
    }
  }, [editingEmployee, form]);

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
  
  const handleEditClick = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const handleEditDialogClose = () => {
    setIsEditDialogOpen(false);
    setEditingEmployee(null);
    form.reset();
  };

  const onEditSubmit = async (data: EmployeeFormData) => {
    if (!pbClient || !editingEmployee) return;
    setIsSubmittingEdit(true);
    try {
      const updatedData: Partial<Employee> = {
        name: data.name,
        email: data.email,
        role: data.role,
        department_text: data.department_text || undefined,
        reportsTo_text: data.reportsTo_text || undefined,
      };
      const updatedRecord = await updateEmployee(pbClient, editingEmployee.id, updatedData);
      setEmployees(prev => prev.map(emp => emp.id === updatedRecord.id ? updatedRecord : emp));
      toast({ title: "Success", description: "Employee details updated." });
      handleEditDialogClose();
    } catch (err) {
      console.error("Error updating employee:", err);
      const detailedError = getDetailedErrorMessage(err);
      toast({ title: "Error Updating Employee", description: detailedError, variant: "destructive" });
    } finally {
      setIsSubmittingEdit(false);
    }
  };
  
  const refetchEmployees = () => {
     if (pbClient && user && canManageEmployees) {
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
  
  if (user && !canManageEmployees && !isLoading) { 
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
                <CardTitle className="text-center">Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground">
                    This page is for Supervisors and Team Leads only.
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
                           <DropdownMenuItem onClick={() => handleEditClick(employee)} className="flex items-center w-full">
                              <Edit className="mr-2 h-4 w-4" /> Edit
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

      {editingEmployee && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleEditDialogClose(); else setIsEditDialogOpen(true); }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-headline">Edit Employee: {editingEmployee.name}</DialogTitle>
              <DialogDescription>Make changes to the employee's details below.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-name">Full Name</Label>
                <Input id="edit-name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-email">Email Address</Label>
                <Input id="edit-email" type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-role">Role / Job Title</Label>
                <Input id="edit-role" {...form.register("role")} />
                {form.formState.errors.role && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.role.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-department_text">Department (Optional)</Label>
                <Input id="edit-department_text" {...form.register("department_text")} />
              </div>
              <div>
                <Label htmlFor="edit-reportsTo_text">Reports To (Optional)</Label>
                <Input id="edit-reportsTo_text" {...form.register("reportsTo_text")} placeholder="Supervisor or Team Lead Name" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" onClick={handleEditDialogClose} disabled={isSubmittingEdit}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmittingEdit}>
                  {isSubmittingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
