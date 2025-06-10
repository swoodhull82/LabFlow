
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/types";
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }), // PocketBase doesn't enforce min 6 on client
  role: z.enum(["admin", "employee"], { required_error: "You need to select a role." }),
});

export function LoginForm() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      role: "employee",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    await login(values.email, values.password, values.role as UserRole);
    // setLoading(false) is handled within the login function of AuthContext
    // to ensure it only happens after the async login operation completes or fails.
    // For this form, we can set isLoading to false if the login function itself doesn't
    // directly cause a navigation or unmount that makes this irrelevant.
    // However, since login navigates, it's often fine.
    // If login errors out and doesn't navigate, we need to reset isLoading.
    // The login function in AuthContext will set its own loading state,
    // this isLoading is specific to the button's disabled state.
    // A more robust way is for login() to return a promise that resolves/rejects,
    // then set isLoading here. For now, AuthContext handles its own loading.
    // If login fails, router.push won't happen, so we should reset isLoading here.
    // The login function doesn't throw on UI side, it shows a toast.
    // So we'll rely on the global loading state from useAuth if needed, or just set it.
     const authContextLoading = form.formState.isSubmitting;
     if (!authContextLoading) {
        setIsLoading(false);
     }
  }

  // Watch for form submission state to manage button loading
  // This is more reliable than a manual setIsLoading(false) after calling login
  React.useEffect(() => {
    if (form.formState.isSubmitting) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [form.formState.isSubmitting]);


  return (
    <Card className="shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl font-headline text-center">Welcome Back</CardTitle>
        <CardDescription className="text-center">Please sign in to continue to LabFlow.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="your.email@example.com" {...field} type="email" autoComplete="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Sign in as</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="employee" />
                        </FormControl>
                        <FormLabel className="font-normal">Employee</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="admin" />
                        </FormControl>
                        <FormLabel className="font-normal">Admin</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
