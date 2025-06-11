
"use client";

import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_NAME } from "@/lib/constants";
import { Loader2, FlaskConical } from "lucide-react";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-foreground">Loading {APP_NAME}...</p>
      </div>
    );
  }

  if (!loading && user) {
    // Already authenticated, redirecting
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-foreground">Redirecting to dashboard...</p>
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
            <FlaskConical
                className="h-16 w-16 text-primary mx-auto mb-4"
                aria-label={`${APP_NAME} Logo Icon`}
            />
          <h1 className="text-4xl font-headline font-bold text-primary">{APP_NAME}</h1>
          <p className="text-muted-foreground mt-2">Streamline Your Laboratory Workflow</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
