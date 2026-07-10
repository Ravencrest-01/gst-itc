import React, { useState } from 'react';
import { SettingsLayout } from './SettingsLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardBody } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(formData);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout title="Profile settings" subtitle="Manage your personal information.">
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email Address">
              <Input value={user?.email || ''} disabled />
            </Field>
            
            <Field label="Full Name">
              <Input 
                value={formData.full_name} 
                onChange={(e) => setFormData({ full_name: e.target.value })} 
                required 
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
