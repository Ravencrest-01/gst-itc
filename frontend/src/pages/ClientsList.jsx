import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Loading } from "@/components/states/Loading";
import { EmptyState } from "@/components/states/EmptyState";
import { Users, Plus } from "lucide-react";
import { listClients, createClient } from "@/api";
import { useToast } from "@/context/ToastContext";

export function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientGstin, setNewClientGstin] = useState("");
  const { toast } = useToast();

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await listClients();
      setClients(res.data?.items || res.items || res.data || res || []);
    } catch (err) {
      console.error(err);
      toast({ title: "Error loading clients", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleAddClient = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
        await createClient({
            legal_name: newClientName,
            gstin: newClientGstin,
            state_code: newClientGstin.substring(0, 2) || "00"
        });
        toast({ title: "Success", description: "Client created successfully." });
        setIsModalOpen(false);
        setNewClientName("");
        setNewClientGstin("");
        loadClients();
    } catch (err) {
        toast({ title: "Error creating client", description: err?.response?.data?.detail || err.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loading && clients.length === 0) return <Loading text="Loading your workspaces..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Client Workspaces</h2>
          <p className="text-muted-foreground">Manage your firm's GST clients and precision ledgers.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Client" description="Create a new workspace for your client.">
        <form onSubmit={handleAddClient} className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Client Name</label>
                <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} required placeholder="Acme Corp" />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium">GSTIN</label>
                <Input value={newClientGstin} onChange={(e) => setNewClientGstin(e.target.value)} required placeholder="27AADCA9090A1Z5" />
            </div>
            <div className="flex justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="mr-2">Cancel</Button>
                <Button type="submit" isLoading={isSubmitting}>Create Client</Button>
            </div>
        </form>
      </Modal>

      {clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients found" description="Add your first client workspace to start reconciling." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map(client => (
            <Card key={client.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/clients/${client.id}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                    {client.legal_name?.charAt(0) || "C"}
                  </div>
                  <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>{client.status || "active"}</Badge>
                </div>
                <CardTitle className="mt-4">{client.legal_name || "Unnamed Client"}</CardTitle>
                <CardDescription className="font-mono text-xs">{client.gstin}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reconciliation Runs:</span>
                  <span className="font-medium">{client.total_runs || 0}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
