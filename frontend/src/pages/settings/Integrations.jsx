import React, { useState } from 'react';
import { SettingsLayout } from './SettingsLayout';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Field, Input } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';

export default function Integrations() {
  const toast = useToast();
  const [isTallyModalOpen, setTallyModalOpen] = useState(false);

  const handleTallyConnect = (e) => {
    e.preventDefault();
    toast.success('Tally configuration saved');
    setTallyModalOpen(false);
  };

  return (
    <SettingsLayout title="Integrations" subtitle="Connect ITC-Rec Engine with your existing tools.">
      <Card>
        <CardBody className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-radius bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-300">account_balance_wallet</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  Tally Prime <Badge tone="neutral">Beta</Badge>
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Import purchase registers directly from Tally Prime using the local ODBC connection or Tally server.
                </p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setTallyModalOpen(true)}>Configure</Button>
          </div>
          
          <div className="border-t border-border" />
          
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-radius bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-green-600 dark:text-green-300">receipt_long</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">GST Portal Auto-fetch</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Automatically download GSTR-2B JSON files by connecting directly to the GSTN portal using API credentials.
                </p>
              </div>
            </div>
            <Button variant="primary">Connect</Button>
          </div>
        </CardBody>
      </Card>

      <Modal
        isOpen={isTallyModalOpen}
        onClose={() => setTallyModalOpen(false)}
        title="Configure Tally Prime"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTallyModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleTallyConnect}>Save Connection</Button>
          </>
        }
      >
        <form id="tally-form" onSubmit={handleTallyConnect} className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Ensure Tally Prime is running and ODBC is enabled (usually port 9000).
          </p>
          <Field label="ODBC Connection String / URL">
            <Input defaultValue="http://localhost:9000" />
          </Field>
          <Field label="Company Name in Tally" hint="Must match exactly with what is shown in Tally.">
            <Input placeholder="Example Pvt Ltd" />
          </Field>
        </form>
      </Modal>
    </SettingsLayout>
  );
}
