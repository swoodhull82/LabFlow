
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
// Removed: import { getEmployees, deleteEmployee, updateEmployee } from "@/services/employeeService";
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

const initialMockEmployees: Employee[] = [
  // Supervisors
  { id: "mock-s1", name: "Dr. Evelyn Hayes", email: "evelyn.hayes@labflow.example", role: "Chief Science Officer", department_text: "Executive Management", reportsTo_text: "" },
  { id: "mock-s2", name: "Mr. Samuel Green", email: "samuel.green@labflow.example", role: "Lab Director", department_text: "Operations", reportsTo_text: "Dr. Evelyn Hayes" },
  // Team Leads
  { id: "mock-tl1", name: "Ms. Olivia Carter", email: "olivia.carter@labflow.example", role: "Team Lead - Chemistry", department_text: "Chemistry", reportsTo_text: "Mr. Samuel Green" },
  { id: "mock-tl2", name: "Mr. David Lee", email: "david.lee@labflow.example", role: "Team Lead - Microbiology", department_text: "Microbiology", reportsTo_text: "Mr. Samuel Green" },
  { id: "mock-tl3", name: "Dr. Priya Sharma", email: "priya.sharma@labflow.example", role: "Team Lead - R&D", department_text: "Research & Development", reportsTo_text: "Mr. Samuel Green" },
  // Analysts
  { id: "mock-a1", name: "Alice Johnson", email: "alice.johnson@labflow.example", role: "Senior Analyst", department_text: "Chemistry", reportsTo_text: "Ms. Olivia Carter" },
  { id: "mock-a2", name: "Bob Williams", email: "bob.williams@labflow.example", role: "Lab Analyst", department_text: "Chemistry", reportsTo_text: "Ms. Olivia Carter" },
  { id: "mock-a3", name: "Carol Davis", email: "carol.davis@labflow.example", role: "Microbiologist I", department_text: "Microbiology", reportsTo_text: "Mr. David Lee" },
  { id: "mock-a4", name: "Daniel Miller", email: "daniel.miller@labflow.example", role: "Research Analyst", department_text: "Research & Development", reportsTo_text: "Dr. Priya Sharma" },
  { id: "mock-a5", name: "Emily Wilson", email: "emily.wilson@labflow.example", role: "Junior Analyst", department_text: "Chemistry", reportsTo_text: "Ms. Olivia Carter" },
  { id: "mock-a6", name: "Frank Garcia", email: "frank.garcia@labflow.example", role: "Lab Technician", department_text: "Microbiology", reportsTo_text: "Mr. David Lee" },
  { id: "mock-a7", name: "Grace Rodriguez", email: "grace.rodriguez@labflow.example", role: "Associate Scientist", department_text: "Research & Development", reportsTo_text: "Dr. Priya Sharma" },
  { id: "mock-a8", name: "Henry Martinez", email: "henry.martinez@labflow.example", role: "Quality Control Analyst", department_text: "Quality Assurance", reportsTo_text: "Mr. Samuel Green" },
];


export default function EmployeesPage() {
  const { user } = useAuth(); // pbClient might not be needed if all ops are local
  const router = useRouter();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start true, then set to false
  const [error, setError] = useState<string | null>(null); // Errors are less likely with mock data
  
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

  useEffect(() => {
    // Simulate loading and set mock data
    setIsLoading(true);
    // Simulate a short delay for loading appearance if desired, or set immediately
    setTimeout(() => {
        setEmployees([...initialMockEmployees]); // Use a copy to allow modification
        setIsLoading(false);
    }, 100); // Small delay to mimic loading
    
    if (user && !canManageEmployees) {
      toast({ title: "Access Denied", description: "This page is for Supervisors and Team Leads only.", variant: "destructive" });
      router.push('/dashboard');
    }
  }, [user, router, toast, canManageEmployees]);


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
    setEmployees(prevEmployees => prevEmployees.filter(emp => emp.id !== employeeId));
    toast({ title: "Success (Mock)", description: "Employee removed from the list." });
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
    if (!editingEmployee) return;
    setIsSubmittingEdit(true);
    
    const updatedEmployeeData: Employee = {
      ...editingEmployee,
      name: data.name,
      email: data.email,
      role: data.role,
      department_text: data.department_text || undefined,
      reportsTo_text: data.reportsTo_text || undefined,
      // Ensure other required fields of Employee type are preserved or handled
      created: editingEmployee.created || new Date().toISOString(), // Keep original or set new
      updated: new Date().toISOString(), // Set new updated time
    };

    setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? updatedEmployeeData : emp));
    toast({ title: "Success (Mock)", description: "Employee details updated in the list." });
    handleEditDialogClose();
    setIsSubmittingEdit(false);
  };
  
  const refetchEmployees = () => {
     setIsLoading(true);
     setTimeout(() => {
        setEmployees([...initialMockEmployees]);
        setIsLoading(false);
        setError(null);
        toast({ title: "Refreshed (Mock)", description: "Employee list reset to mock data." });
    }, 100);
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
          <CardDescription>Manage employee information and access. (Displaying Mock Data)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading employees...</p>
            </div>
          )}
          {error && !isLoading && ( // This error state is less likely with mock data
            <div className="text-center py-10 text-destructive">
              <p>{error}</p>
              <Button onClick={refetchEmployees} className="mt-4">Try Again</Button>
            </div>
          )}
          {!isLoading && !error && employees.length === 0 && (
             <div className="text-center py-10 text-muted-foreground">
              <p>No employees found in the mock data. This shouldn't happen if initialized correctly.</p>
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
              <DialogDescription>Make changes to the employee's details below. (Changes are local to this mock list)</DialogDescription>
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

    