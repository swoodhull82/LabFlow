
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { createEmployee } from "@/services/employeeService";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import React, { useState, useEffect } from "react";
import type { Employee } from "@/lib/types";

const employeeFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  role: z.string().min(2, { message: "Role must be at least 2 characters." }),
  department_text: z.string().optional(),
  reportsTo_text: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeFormSchema>;

export default function NewEmployeePage() {
  const { pbClient, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

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


  const onSubmit = async (data: EmployeeFormData) => {
    if (!pbClient || !user || !canManageEmployees) {
      toast({ title: "Error", description: "Unauthorized or client not available.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      const employeePayload: Partial<Omit<Employee, 'id' | 'created' | 'updated'>> = {
        name: data.name,
        email: data.email,
        role: data.role,
        department_text: data.department_text || undefined,
        reportsTo_text: data.reportsTo_text || undefined,
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
  
  if (!user) {
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
              <Label htmlFor="role">Role / Job Title</Label>
              <Input id="role" {...form.register("role")} placeholder="e.g., Senior Lab Analyst" />
              {form.formState.errors.role && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.role.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="department_text">Department (Optional)</Label>
              <Input id="department_text" {...form.register("department_text")} placeholder="e.g., Chemistry" />
            </div>
            <div>
              <Label htmlFor="reportsTo_text">Reports To (Optional)</Label>
              <Input id="reportsTo_text" {...form.register("reportsTo_text")} placeholder="e.g., Dr. John Smith (Supervisor) or Ms. Ada Wong (Team Lead)" />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.push("/employees")} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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
