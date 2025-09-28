'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function AuthCodeError() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Authentication Error
          </h1>
          <p className="text-muted-foreground mb-4">
            Sorry, there was a problem with your authentication. This could be
            due to:
          </p>
          <ul className="text-sm text-muted-foreground text-left space-y-1 mb-6">
            <li>• The authentication link has expired</li>
            <li>• The link has already been used</li>
            <li>• There was a network error</li>
            <li>• Invalid authentication code</li>
          </ul>
        </div>

        <div className="space-y-4">
          <Button onClick={() => router.push('/')} className="w-full" size="lg">
            Try Again
          </Button>

          <p className="text-sm text-muted-foreground">
            If the problem persists, please try signing in again.
          </p>
        </div>
      </div>
    </div>
  );
}
