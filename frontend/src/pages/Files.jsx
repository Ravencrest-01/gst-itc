import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync';
import { useActiveClient } from '../context/ActiveClientContext';
import * as filesApi from '../api/files';
import { PageHeader } from '../components/data/PageHeader';
import { ClientTabs } from '../components/data/ClientTabs';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Field, Select, Input } from '../components/ui/Field';
import { Dropzone } from '../components/ui/Dropzone';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';

export default function Files() {
  const { id } = useParams();
  const { activeClient, setActive } = useActiveClient();
  const toast = useToast();

  useEffect(() => {
    if (id && activeClient?.id !== id) {
      setActive(id);
    }
  }, [id, activeClient, setActive]);

  const { data: filesData, loading, error, reload } = useAsync(() => filesApi.list(id), true, [id]);
  const filesList = filesData?.items || [];

  const [isModalOpen, setModalOpen] = useState(false);
  const [fileObj, setFileObj] = useState(null);
  const [kind, setKind] = useState('pr');
  const [financialYear, setFinancialYear] = useState('2026-27');
  const [taxPeriod, setTaxPeriod] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const openAdd = () => {
    setFileObj(null);
    setKind('pr');
    setTaxPeriod('');
    setModalOpen(true);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileObj) {
      toast.error('Please select a file');
      return;
    }
    setSubmitting(true);
    try {
      await filesApi.upload(id, fileObj, kind, financialYear, taxPeriod);
      toast.success('File uploaded successfully');
      setModalOpen(false);
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await filesApi.remove(deleteId);
      toast.success('File deleted');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to delete file');
    } finally {
      setSubmitting(false);
      setDeleteId(null);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !filesData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow="Manage Files"
        title={activeClient?.legal_name || 'Loading...'}
        crumbs={[{ label: 'Companies', path: '/clients' }, { label: activeClient?.legal_name || 'Company', path: `/clients/${id}` }, { label: 'Files' }]}
        actions={
          <Button variant="primary" onClick={openAdd}>
            <span className="material-symbols-outlined mr-2">upload</span>
            Upload file
          </Button>
        }
      />

      <ClientTabs id={id} />

      <Card>
        <CardBody flush>
          {filesList.length === 0 ? (
            <Empty 
              icon="folder_open" 
              title="No files uploaded" 
              message="Upload Purchase Registers and GSTR-2B files here."
              action={<Button variant="primary" onClick={openAdd}>Upload file</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Kind</th>
                  <th>Period</th>
                  <th>Size</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filesList.map((file) => (
                  <tr key={file.id} className="group">
                    <td className="font-medium text-foreground">{file.original_filename}</td>
                    <td>
                      <Badge tone={file.kind === 'pr' ? 'blue' : 'neutral'}>
                        {file.kind === 'pr' ? 'Purchase Register' : 'GSTR-2B'}
                      </Badge>
                    </td>
                    <td>{file.financial_year} • {file.tax_period || 'All'}</td>
                    <td className="text-muted-foreground">{formatSize(file.size_bytes)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="text-muted-foreground hover:text-destructive p-1"
                          onClick={() => setDeleteId(file.id)}
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
        title="Upload File"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleUpload} disabled={submitting || !fileObj}>Upload</Button>
          </>
        }
      >
        <form id="upload-form" onSubmit={handleUpload} className="space-y-6">
          <Field label="File Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} required>
              <option value="pr">Purchase Register (Excel/CSV)</option>
              <option value="2b">GSTR-2B (JSON)</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Financial Year">
              <Select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} required>
                <option value="2026-27">2026-27</option>
                <option value="2025-26">2025-26</option>
              </Select>
            </Field>
            
            <Field label="Tax Period" hint="e.g. Apr, Q1, etc.">
              <Input 
                value={taxPeriod} 
                onChange={(e) => setTaxPeriod(e.target.value)} 
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="File">
            <Dropzone 
              label={`Drop your ${kind === 'pr' ? 'Excel/CSV' : 'JSON'} file here`}
              accept={kind === 'pr' ? '.xlsx,.csv' : '.json'}
              file={fileObj}
              onFile={setFileObj}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        danger
        title="Delete file?"
        message="Are you sure you want to delete this file? This will not affect past reconciliations, but it won't be available for new ones."
        busy={submitting}
      />
    </div>
  );
}
