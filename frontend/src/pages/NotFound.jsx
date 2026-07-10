import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/states/EmptyState";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <Card className="w-full max-w-md shadow-sm border-none bg-transparent">
        <CardContent className="pt-6 text-center">
          <EmptyState 
            icon={FileQuestion} 
            title="404 - Page Not Found" 
            description="The page you are looking for doesn't exist or has been moved."
            action={
              <Button asChild>
                <Link to="/dashboard">Return to Dashboard</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
