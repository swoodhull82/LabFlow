
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createEmployee, getEmployees } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import type { Employee, UserRole } from "@/lib/types";
import type PocketBase from "pocketbase";

const employeeFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  role: z.string().min(1, { message: "Role is required." }),
  department_text: z.string().optional(),
  reportsTo_text: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeFormSchema>;

const NONE_REPORTS_TO_VALUE = "__NONE__";
const AVAILABLE_ROLES: UserRole[] = ["Supervisor", "Team Lead", "Chem I", "Chem II"];
const AVAILABLE_DEPARTMENTS = ["Trace Metals", "Automated", "Air & Grav", "Organics", "BacT", "Radiation", "MAU", "SpecOp"];

export default function NewEmployeePage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [potentialManagers, setPotentialManagers] = useState<Employee[]>([]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);

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
    if (user && !canManageEmployees) {
      toast({ title: "Access Denied", description: "You are not authorized to add employees.", variant: "destructive" });
      router.push("/dashboard");
    }
  }, [user, router, toast, canManageEmployees]);

  const fetchManagersCallback = useCallback(async (pb: PocketBase | null) => {
    if (!pb || !canManageEmployees) return;
    setIsLoadingManagers(true);
    try {
      const allEmployees = await getEmployees(pb);
      const managers = allEmployees.filter(
        (emp) => emp.role === "Supervisor" || emp.role === "Team Lead"
      );
      setPotentialManagers(managers);
    } catch (error: any) {
      const isPocketBaseAutocancel = error?.isAbort === true;
      const isGeneralAutocancelOrNetworkIssue = error?.status === 0;
      const isMessageAutocancel = typeof error?.message === 'string' && error.message.toLowerCase().includes("autocancelled");

      if (isPocketBaseAutocancel || isGeneralAutocancelOrNetworkIssue || isMessageAutocancel) {
        console.warn("Fetch potential managers request was autocancelled or due to a network issue.", error);
      } else {
        console.error("Failed to fetch potential managers:", error);
        toast({ title: "Error", description: "Could not load list of potential managers.", variant: "destructive" });
      }
    } finally {
      setIsLoadingManagers(false);
    }
  }, [toast, canManageEmployees]);


  useEffect(() => {
    fetchManagersCallback(pbClient);
  }, [pbClient, fetchManagersCallback]);


  const onSubmit = async (data: EmployeeFormData) => {
    if (!pbClient || !user || !canManageEmployees) {
      toast({ title: "Error", description: "Unauthorized or client not available.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      const finalReportsTo = data.reportsTo_text === NONE_REPORTS_TO_VALUE || !data.reportsTo_text 
        ? undefined 
        : data.reportsTo_text;

      const finalDepartment = data.department_text === NONE_REPORTS_TO_VALUE || !data.department_text
        ? undefined
        : data.department_text;

      const employeePayload: Partial<Omit<Employee, 'id' | 'created' | 'updated'>> = {
        name: data.name,
        email: data.email,
        role: data.role,
        department_text: finalDepartment,
        reportsTo_text: finalReportsTo,
      };

      await createEmployee(pbClient, employeePayload);
      toast({ title: "Success", description: "New employee added successfully!" });
      router.push("/employees");
    } catch (error: any) {
      console.error("Failed to create employee:", error);
      let errorMessage = "Failed to add employee. Please try again.";
      if (error.data && error.data.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!user && !isLoadingManagers && !isSubmitting) {
     return (
      <div className="flex items-center justify-center h-full p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user data...</p>
      </div>
    );
  }
  
  if (user && !canManageEmployees) {
      return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
                <CardTitle className="text-center">Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground">
                    You are not authorized to view this page.
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-semibold">Add New Employee</h1>
        <Button variant="outline" asChild>
          <Link href="/employees">Cancel</Link>
        </Button>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Employee Information</CardTitle>
          <CardDescription>Fill in the details for the new employee.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" {...form.register("name")} placeholder="e.g., Dr. Jane Doe" />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" {...form.register("email")} placeholder="e.g., jane.doe@example.com" />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="role-select">Role / Job Title</Label>
              <Controller
                name="role"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ""} >
                    <SelectTrigger id="role-select">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ROLES.map(roleValue => (
                        <SelectItem key={roleValue} value={roleValue}>{roleValue}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.role && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.role.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="department_text">Department (Optional)</Label>
              <Controller
                name="department_text"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <SelectTrigger id="department_text">
                      <SelectValue placeholder="Select a department (Optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_REPORTS_TO_VALUE}>None</SelectItem>
                      {AVAILABLE_DEPARTMENTS.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
               {form.formState.errors.department_text && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.department_text.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="reportsTo_text">Reports To (Supervisor or Team Lead - Optional)</Label>
              <Controller
                name="reportsTo_text"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ""} >
                    <SelectTrigger id="reportsTo_text" disabled={isLoadingManagers}>
                      <SelectValue placeholder={isLoadingManagers ? "Loading managers..." : "Select a manager"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_REPORTS_TO_VALUE}>None</SelectItem>
                      {potentialManagers.map((manager) => (
                        <SelectItem key={manager.id} value={manager.name}>
                          {manager.name} ({manager.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.push("/employees")} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isLoadingManagers}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Employee
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
    

    
