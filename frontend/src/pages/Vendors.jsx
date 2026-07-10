import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { useActiveClient } from '../context/ActiveClientContext';
import * as vendorsApi from '../api/vendors';
import { PageHeader } from '../components/data/PageHeader';
import { ClientTabs } from '../components/data/ClientTabs';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Field';
import { useToast } from '../context/ToastContext';

export default function Vendors() {
  const { id } = useParams();
  const { activeClient, setActive } = useActiveClient();
  const toast = useToast();

  useEffect(() => {
    if (id && activeClient?.id !== id) {
      setActive(id);
    }
  }, [id, activeClient, setActive]);

  const { data: vendorsData, loading, error, reload } = useAsync(() => vendorsApi.list(id), true, [id]);
  const vendors = vendorsData?.items || [];

  const [isModalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({ gstin: '', name: '' });
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const openAdd = () => {
    setEditingId(null);
    setFormData({ gstin: '', name: '' });
    setModalOpen(true);
  };

  const openEdit = (vendor) => {
    setEditingId(vendor.id);
    setFormData({ gstin: vendor.gstin, name: vendor.name });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await vendorsApi.update(id, editingId, formData);
        toast.success('Vendor updated');
      } else {
        await vendorsApi.create(id, formData);
        toast.success('Vendor added');
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to save vendor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await vendorsApi.remove(id, deleteId);
      toast.success('Vendor deleted');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to delete vendor');
    } finally {
      setSubmitting(false);
      setDeleteId(null);
    }
  };

  if (loading && !vendorsData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Manage Vendors"
        title={activeClient?.legal_name || 'Loading...'}
        crumbs={[{ label: 'Companies', path: '/clients' }, { label: activeClient?.legal_name || 'Company', path: `/clients/${id}` }, { label: 'Vendors' }]}
        actions={
          <Button variant="primary" onClick={openAdd}>
            <span className="material-symbols-outlined mr-2">add</span>
            Add vendor
          </Button>
        }
      />

      <ClientTabs id={id} />

      <Card>
        <CardBody flush>
          {vendors.length === 0 ? (
            <Empty 
              icon="store" 
              title="No vendors added" 
              message="Add your frequent suppliers to better track ITC."
              action={<Button variant="primary" onClick={openAdd}>Add vendor</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>GSTIN</th>
                  <th>Vendor Name</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="group">
                    <td className="mono-tabular font-medium">{vendor.gstin}</td>
                    <td className="text-foreground">{vendor.name}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="text-muted-foreground hover:text-accent p-1"
                          onClick={() => openEdit(vendor)}
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button 
                          className="text-muted-foreground hover:text-destructive p-1"
                          onClick={() => setDeleteId(vendor.id)}
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
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Vendor" : "Add Vendor"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>Save</Button>
          </>
        }
      >
        <form id="vendor-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="GSTIN">
            <Input 
              value={formData.gstin} 
              onChange={(e) => setFormData(p => ({ ...p, gstin: e.target.value }))} 
              required 
              mono
            />
          </Field>
          <Field label="Vendor Name">
            <Input 
              value={formData.name} 
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} 
              required 
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        danger
        title="Delete vendor?"
        message="Are you sure you want to delete this vendor? They will no longer be tracked in this company's profile."
        busy={submitting}
      />
    </div>
  );
}
