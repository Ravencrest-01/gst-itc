import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import * as clientsApi from '../api/clients';
import { useActiveClient } from '../context/ActiveClientContext';
import { useToast } from '../context/ToastContext';
import { STATES_ENUM } from '../lib/constants';

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh, setActive } = useActiveClient();
  const toast = useToast();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    legal_name: '',
    gstin: '',
    state_code: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const newClient = await clientsApi.create(formData);
      await refresh();
      setActive(newClient.id);
      toast.success('Company added successfully');
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to add company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mb-4 text-accent">
            <span className="material-symbols-outlined text-2xl">business</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Add your first company</h1>
          <p className="text-muted-foreground mt-2">Let's set up a company so you can start reconciling ITC.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Legal Name" error={error}>
            <Input 
              value={formData.legal_name} 
              onChange={(e) => handleChange('legal_name', e.target.value)} 
              required 
              placeholder="Company Pvt Ltd"
              error={!!error}
            />
          </Field>
          
          <Field label="GSTIN">
            <Input 
              value={formData.gstin} 
              onChange={(e) => handleChange('gstin', e.target.value)} 
              required 
              mono
              placeholder="27AADCB2230M1Z2"
            />
          </Field>

          <Field label="State Code">
            <Select 
              value={formData.state_code} 
              onChange={(e) => handleChange('state_code', e.target.value)} 
              required
            >
              <option value="">Select State</option>
              {Object.entries(STATES_ENUM).map(([code, name]) => (
                <option key={code} value={code}>{code} - {name}</option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-3 mt-8">
            <Button type="submit" variant="primary" block disabled={loading}>
              {loading ? 'Adding...' : 'Add company'}
            </Button>
            <Button type="button" variant="ghost" block onClick={() => navigate('/dashboard')} disabled={loading}>
              Skip for now
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
