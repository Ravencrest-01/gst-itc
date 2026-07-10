import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveClient } from '../context/ActiveClientContext';
import * as clientsApi from '../api/clients';
import { PageHeader } from '../components/data/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHead, CardBody } from '../components/ui/Card';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { useToast } from '../context/ToastContext';
import { STATES_ENUM } from '../lib/constants';

export default function Clients() {
  const navigate = useNavigate();
  const { clients, loading, error, refresh, setActive } = useActiveClient();
  const toast = useToast();

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({ legal_name: '', gstin: '', state: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await clientsApi.create(formData);
      await refresh();
      toast.success('Company added');
      setAddModalOpen(false);
      setFormData({ legal_name: '', gstin: '', state: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to add company');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await clientsApi.remove(deleteId);
      await refresh();
      toast.success('Company deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete company');
    } finally {
      setSubmitting(false);
      setDeleteId(null);
    }
  };

  const openClient = (id) => {
    setActive(id);
    navigate(`/clients/${id}`);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Manage the taxpayers in this workspace."
        actions={
          <Button variant="primary" onClick={() => setAddModalOpen(true)}>
            <span className="material-symbols-outlined mr-2">add</span>
            Add company
          </Button>
        }
      />

      <Card>
        <CardBody flush>
          {clients.length === 0 ? (
            <Empty 
              icon="business" 
              title="No companies yet" 
              message="Add your first company to start reconciling."
              action={<Button variant="primary" onClick={() => setAddModalOpen(true)}>Add company</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>Legal Name</th>
                  <th>GSTIN</th>
                  <th>State</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="group">
                    <td 
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() => openClient(client.id)}
                    >
                      {client.legal_name}
                    </td>
                    <td className="mono-tabular">{client.gstin}</td>
                    <td>{STATES_ENUM[client.state] || client.state}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="text-muted-foreground hover:text-accent p-1"
                          onClick={() => openClient(client.id)}
                          title="Open"
                        >
                          <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                        </button>
                        <button 
                          className="text-muted-foreground hover:text-destructive p-1"
                          onClick={() => setDeleteId(client.id)}
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Company"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleAddSubmit} disabled={submitting}>Add</Button>
          </>
        }
      >
        <form id="add-company-form" onSubmit={handleAddSubmit} className="space-y-4">
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

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        danger
        title="Delete company?"
        message="This will permanently delete the company and all its reconciliations. This action cannot be undone."
        busy={submitting}
      />
    </div>
  );
}
