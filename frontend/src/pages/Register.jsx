import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Field, Input, Segmented } from '../components/ui/Field';
import * as authApi from '../api/auth';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    workspace_name: '',
    workspace_type: 'solo'
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register(formData);
      toast.success('Account created successfully');
      // Automatically log them in
      await login({ email: formData.email, password: formData.password });
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Create an account</h1>
          <p className="text-muted-foreground mt-2">
            Start your ITC-Rec Engine journey
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <Field label="Full Name">
            <Input 
              value={formData.full_name} 
              onChange={(e) => handleChange('full_name', e.target.value)} 
              required 
            />
          </Field>
          
          <Field label="Email" error={error}>
            <Input 
              type="email" 
              value={formData.email} 
              onChange={(e) => handleChange('email', e.target.value)} 
              required 
              placeholder="name@company.com"
              error={!!error}
            />
          </Field>

          <Field label="Password">
            <Input 
              type="password" 
              value={formData.password} 
              onChange={(e) => handleChange('password', e.target.value)} 
              required 
            />
          </Field>

          <div className="pt-2 border-t border-border mt-4 mb-2" />

          <Field label="Workspace Name">
            <Input 
              value={formData.workspace_name} 
              onChange={(e) => handleChange('workspace_name', e.target.value)} 
              required 
              placeholder="My CA Firm"
            />
          </Field>

          <Field label="Account Type">
            <Segmented 
              value={formData.workspace_type}
              onChange={(val) => handleChange('workspace_type', val)}
              options={[
                { label: 'Solo Practice', value: 'solo' },
                { label: 'Firm (Multi-user)', value: 'firm' }
              ]}
              className="w-full"
            />
          </Field>

          <Button type="submit" variant="primary" block disabled={loading} className="mt-6">
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
