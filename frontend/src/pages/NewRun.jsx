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
  const [prFile, setPrFile] = useState(null);
  const [gstr2bFile, setGstr2bFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setRunning(true);
    try {
      let prFileId = null;
      let gstr2bFileId = null;

      // Upload files first if provided
      if (prFile) {
        const prRes = await filesApi.upload(id, prFile, 'purchase_register', formData.financial_year, formData.tax_period);
        prFileId = prRes.id;
      }
      
      if (gstr2bFile) {
        const gstr2bRes = await filesApi.upload(id, gstr2bFile, 'gstr_2b', formData.financial_year, formData.tax_period);
        gstr2bFileId = gstr2bRes.id;
      }

      // Create run with the file IDs (or existing files if ids are null but periods match)
      const runPayload = {
        ...formData,
        purchase_file_id: prFileId,
        portal_file_id: gstr2bFileId
      };

      const run = await runsApi.reconcile(id, runPayload);
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

      <div className="max-w-3xl">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-8">
              
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

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Upload Files</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your Purchase Register and GSTR-2B files for the selected period. If you already uploaded them from the Files tab, you can leave these blank.
                </p>
                
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Purchase Register">
                    <Dropzone 
                      label="Drop Excel/CSV file here"
                      accept=".xlsx,.csv,.xls"
                      file={prFile}
                      onFile={setPrFile}
                    />
                    {prFile && <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 flex items-center"><span className="material-symbols-outlined text-[16px] mr-1">check_circle</span> Tagged as Purchase Register</div>}
                  </Field>

                  <Field label="GSTR-2B">
                    <Dropzone 
                      label="Drop JSON/Excel/CSV file here"
                      accept=".json,.xlsx,.csv,.xls"
                      file={gstr2bFile}
                      onFile={setGstr2bFile}
                    />
                    {gstr2bFile && <div className="mt-2 text-xs text-neutral-600 bg-neutral-50 p-2 rounded border border-neutral-200 flex items-center"><span className="material-symbols-outlined text-[16px] mr-1">check_circle</span> Tagged as GSTR-2B</div>}
                  </Field>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border justify-end">
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
                  disabled={running}
                >
                  {running ? (
                    <>
                      <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                      Starting...
                    </>
                  ) : 'Start reconciliation'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
