import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActiveClient } from '../context/ActiveClientContext';
import * as runsApi from '../api/runs';
import * as filesApi from '../api/files';
import { PageHeader } from '../components/data/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Select, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Dropzone } from '../components/ui/Dropzone';
import { useToast } from '../context/ToastContext';

export default function NewRun() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeClient, setActive } = useActiveClient();
  const toast = useToast();

  useEffect(() => {
    if (id && activeClient?.id !== id) {
      setActive(id);
    }
  }, [id, activeClient, setActive]);

  const [formData, setFormData] = useState({
    financial_year: '2026-27',
    tax_period: ''
  });
  const [running, setRunning] = useState(false);

  // File Upload State
  const [isModalOpen, setModalOpen] = useState(false);
  const [fileObj, setFileObj] = useState(null);
  const [kind, setKind] = useState('purchase_register');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileObj) {
      toast.error('Please select a file');
      return;
    }
    setUploading(true);
    try {
      await filesApi.upload(id, fileObj, kind, formData.financial_year, formData.tax_period);
      toast.success('File uploaded successfully');
      setModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const openUpload = () => {
    setFileObj(null);
    setKind('purchase_register');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setRunning(true);
    try {
      const run = await runsApi.reconcile(id, formData);
      toast.success('Reconciliation started');
      navigate(`/runs/${run.id}`);
    } catch (err) {
      toast.error(err.message || 'Failed to start reconciliation');
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="New Reconciliation"
        title={activeClient?.legal_name || 'Loading...'}
        crumbs={[
          { label: 'Companies', path: '/clients' }, 
          { label: activeClient?.legal_name || 'Company', path: `/clients/${id}` }, 
          { label: 'Reconciliations', path: `/clients/${id}/runs` },
          { label: 'New Run' }
        ]}
      />

      <div className="max-w-xl">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-accent/10 border border-accent/20 rounded-radius p-4 flex gap-3">
                <span className="material-symbols-outlined text-accent shrink-0">info</span>
                <div className="text-sm text-accent-foreground space-y-3">
                  <p>
                    Starting a new reconciliation will use all available Purchase Register and GSTR-2B files uploaded for the selected period. Ensure your files are up to date before proceeding.
                  </p>
                  <p>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={openUpload}
                      className="bg-white"
                    >
                      <span className="material-symbols-outlined mr-2">upload</span>
                      Upload files now
                    </Button>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Financial Year">
                  <Select 
                    value={formData.financial_year} 
                    onChange={(e) => setFormData(p => ({ ...p, financial_year: e.target.value }))}
                    required
                  >
                    <option value="2026-27">2026-27</option>
                    <option value="2025-26">2025-26</option>
                  </Select>
                </Field>

                <Field label="Tax Period" hint="Leave blank to run for entire FY">
                  <Input 
                    value={formData.tax_period} 
                    onChange={(e) => setFormData(p => ({ ...p, tax_period: e.target.value }))}
                    placeholder="Optional (e.g. Apr)"
                  />
                </Field>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => navigate(`/clients/${id}/runs`)}
                  disabled={running}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  className="flex-1"
                  disabled={running}
                >
                  {running ? (
                    <>
                      <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                      Running reconciliation...
                    </>
                  ) : 'Start reconciliation'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Upload File"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={uploading}>Cancel</Button>
            <Button variant="primary" onClick={handleUpload} disabled={uploading || !fileObj}>Upload</Button>
          </>
        }
      >
        <form id="upload-form" onSubmit={handleUpload} className="space-y-6">
          <Field label="File Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} required>
              <option value="purchase_register">Purchase Register (Excel/CSV)</option>
              <option value="gstr_2b">GSTR-2B (JSON/Excel/CSV)</option>
            </Select>
          </Field>

          {/* Note: Financial Year and Tax Period use the values from the main New Run form */}
          <div className="bg-secondary p-3 rounded-md text-sm text-muted-foreground flex gap-2">
             <span className="material-symbols-outlined text-[18px]">info</span>
             <p>This file will be uploaded for <strong>{formData.financial_year}</strong> {formData.tax_period ? `(${formData.tax_period})` : ''}.</p>
          </div>

          <Field label="File">
            <Dropzone 
              label={`Drop your ${kind === 'purchase_register' ? 'Excel/CSV' : 'JSON/Excel/CSV'} file here`}
              accept={kind === 'purchase_register' ? '.xlsx,.csv,.xls' : '.json,.xlsx,.csv,.xls'}
              file={fileObj}
              onFile={setFileObj}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
