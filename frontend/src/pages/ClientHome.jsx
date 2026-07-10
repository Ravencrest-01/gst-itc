import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import * as clientsApi from '../api/clients';
import { PageHeader } from '../components/data/PageHeader';
import { ClientTabs } from '../components/data/ClientTabs';
import { Loading, ErrorState } from '../components/states/States';
import { Button } from '../components/ui/Button';
import { Card, CardHead, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { useToast } from '../context/ToastContext';
import { STATES_ENUM } from '../lib/constants';
import { useActiveClient } from '../context/ActiveClientContext';

export default function ClientHome() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh: refreshGlobalClients } = useActiveClient();

  const { data: client, loading, error, reload } = useAsync(() => clientsApi.get(id), true, [id]);

  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({ legal_name: '', gstin: '', state: '' });
  const [submitting, setSubmitting] = useState(false);

  const openEditModal = () => {
    if (client) {
      setFormData({
        legal_name: client.legal_name,
        gstin: client.gstin,
        state: client.state
      });
      setEditModalOpen(true);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await clientsApi.update(id, formData);
      toast.success('Company updated');
      setEditModalOpen(false);
      await reload();
      await refreshGlobalClients();
    } catch (err) {
      toast.error(err.message || 'Failed to update company');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!client) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Company Overview"
        title={client.legal_name}
        crumbs={[{ label: 'Companies', path: '/clients' }, { label: client.legal_name }]}
        actions={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={openEditModal}>
              <span className="material-symbols-outlined mr-2">edit</span>
              Edit
            </Button>
            <Button variant="primary" onClick={() => navigate(`/clients/${id}/runs/new`)}>
              <span className="material-symbols-outlined mr-2">add</span>
              New reconciliation
            </Button>
          </div>
        }
      />

      <ClientTabs id={id} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHead title="Company Details" />
          <CardBody className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">GSTIN</p>
              <p className="text-foreground mono-tabular">{client.gstin}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">State</p>
              <p className="text-foreground">{STATES_ENUM[client.state] || client.state} ({client.state})</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Added on</p>
              <p className="text-foreground">{new Date(client.created_on || client.created_at).toLocaleDateString()}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Quick Links" />
          <CardBody className="space-y-3">
            <button 
              onClick={() => navigate(`/clients/${id}/vendors`)}
              className="w-full flex items-center justify-between p-3 border border-border rounded-radius hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">store</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Manage Vendors</p>
                  <p className="text-xs text-muted-foreground">Add or update frequent suppliers</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-muted-foreground">chevron_right</span>
            </button>

            <button 
              onClick={() => navigate(`/clients/${id}/files`)}
              className="w-full flex items-center justify-between p-3 border border-border rounded-radius hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Uploaded Files</p>
                  <p className="text-xs text-muted-foreground">View PR and GSTR-2B files</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-muted-foreground">chevron_right</span>
            </button>
            
            <button 
              onClick={() => navigate(`/clients/${id}/runs`)}
              className="w-full flex items-center justify-between p-3 border border-border rounded-radius hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-matched/10 text-matched flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">sync_alt</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Reconciliations</p>
                  <p className="text-xs text-muted-foreground">View all past runs</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-muted-foreground">chevron_right</span>
            </button>
          </CardBody>
        </Card>
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Company"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleEditSubmit} disabled={submitting}>Save</Button>
          </>
        }
      >
        <form id="edit-company-form" onSubmit={handleEditSubmit} className="space-y-4">
          <Field label="Legal Name">
            <Input 
              value={formData.legal_name} 
              onChange={(e) => setFormData(p => ({ ...p, legal_name: e.target.value }))} 
              required 
            />
          </Field>
          <Field label="GSTIN">
            <Input 
              value={formData.gstin} 
              onChange={(e) => setFormData(p => ({ ...p, gstin: e.target.value }))} 
              required 
              mono
            />
          </Field>
          <Field label="State Code">
            <Select 
              value={formData.state} 
              onChange={(e) => setFormData(p => ({ ...p, state: e.target.value }))} 
              required
            >
              <option value="">Select State</option>
              {Object.entries(STATES_ENUM).map(([code, name]) => (
                <option key={code} value={code}>{code} - {name}</option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
