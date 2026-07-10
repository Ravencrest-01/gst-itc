import React, { useState } from 'react';
import { SettingsLayout } from './SettingsLayout';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as workspaceApi from '../../api/workspace';
import { Card, CardBody } from '../../components/ui/Card';
import { Field, Input, Segmented } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Loading, ErrorState } from '../../components/states/States';

export default function Workspace() {
  const { workspaceType } = useAuth();
  const toast = useToast();
  const { data: settings, loading, error, reload } = useAsync(workspaceApi.getSettings);

  const [formData, setFormData] = useState(null);
  const [saving, setSaving] = useState(false);

  // Initialize form data once loaded
  React.useEffect(() => {
    if (settings && !formData) {
      setFormData({
        auto_match_threshold: settings.auto_match_threshold || 10,
        enable_fuzzy_match: settings.enable_fuzzy_match ?? true,
      });
    }
  }, [settings, formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await workspaceApi.updateSettings(formData);
      toast.success('Workspace settings updated');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsLayout title="Workspace"><Loading /></SettingsLayout>;
  if (error) return <SettingsLayout title="Workspace"><ErrorState error={error} onRetry={reload} /></SettingsLayout>;
  if (!formData) return null;

  return (
    <SettingsLayout title="Workspace settings" subtitle="Configure matching rules and workspace defaults.">
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Field 
              label="Auto-match threshold (₹)" 
              hint="Differences up to this amount will be automatically considered as matched."
            >
              <Input 
                type="number" 
                min="0"
                step="0.01"
                value={formData.auto_match_threshold} 
                onChange={(e) => setFormData(p => ({ ...p, auto_match_threshold: Number(e.target.value) }))} 
                className="max-w-xs"
              />
            </Field>

            <div className="border-t border-border" />

            <Field 
              label="Fuzzy matching" 
              hint="Enable AI-powered fuzzy matching for slightly different invoice numbers."
            >
              <Segmented
                value={formData.enable_fuzzy_match ? 'yes' : 'no'}
                onChange={(v) => setFormData(p => ({ ...p, enable_fuzzy_match: v === 'yes' }))}
                options={[
                  { label: 'Enabled', value: 'yes' },
                  { label: 'Disabled', value: 'no' }
                ]}
                className="w-full sm:w-auto"
              />
            </Field>

            <div className="pt-4 flex justify-end">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </SettingsLayout>
  );
}
