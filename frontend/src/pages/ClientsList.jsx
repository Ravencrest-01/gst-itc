import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/states/Loading";
import { EmptyState } from "@/components/states/EmptyState";
import { Users, Plus } from "lucide-react";
import { listClients } from "@/api";

export function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock fetch
    setTimeout(() => {
      setClients([
        { id: "1", name: "Global Industries Ltd", gstin: "27AADCA9090A1Z5", status: "active", total_runs: 12 },
        { id: "2", name: "TechStart Inc", gstin: "29AABCT1234Q1Z1", status: "active", total_runs: 4 },
      ]);
      setLoading(false);
    }, 800);
  }, []);

  if (loading) return <Loading text="Loading your workspaces..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Client Workspaces</h2>
          <p className="text-muted-foreground">Manage your firm's GST clients and precision ledgers.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients found" description="Add your first client workspace to start reconciling." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map(client => (
            <Card key={client.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/clients/${client.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                    {client.name.charAt(0)}
                  </div>
                  <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>{client.status}</Badge>
                </div>
                <CardTitle className="mt-4">{client.name}</CardTitle>
                <CardDescription className="font-mono text-xs">{client.gstin}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reconciliation Runs:</span>
                  <span className="font-medium">{client.total_runs}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
