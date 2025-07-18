
import { SignUpForm } from '@/components/auth/SignUpForm';
import { APP_NAME } from "@/lib/constants";
import { FlaskConical } from "lucide-react";

export default function SignUpPage() {
  return (
     <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
            <FlaskConical
                className="h-16 w-16 text-primary mx-auto mb-4"
                aria-label={`${APP_NAME} Logo Icon`}
            />
          <h1 className="text-4xl font-headline font-bold text-primary">{APP_NAME}</h1>
          <p className="text-muted-foreground mt-2">Create your account to get started.</p>
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}
