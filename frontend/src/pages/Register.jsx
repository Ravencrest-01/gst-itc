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
  
  const [step, setStep] = useState(1);
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
  const [otp, setOtp] = useState('');

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.requestOtp(formData.email);
      setStep(2);
      toast.info('OTP sent to your email');
    } catch (err) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register({ ...formData, otp_code: otp });
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
            {step === 1 ? 'Start your ITC-Rec Engine journey' : 'Verify your email address'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
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
              {loading ? 'Sending OTP...' : 'Continue'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="text-sm text-center mb-4">
              Enter the 6-digit code sent to <span className="font-medium">{formData.email}</span>
            </div>
            
            <Field label="6-digit code" error={error}>
              <Input 
                value={otp} 
                onChange={(e) => setOtp(e.target.value)} 
                required 
                maxLength={6}
                mono
                className="text-center text-lg tracking-widest"
                placeholder="000000"
                error={!!error}
              />
            </Field>

            <div className="flex gap-3 mt-6">
              <Button type="button" variant="default" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
                {loading ? 'Creating...' : 'Create account'}
              </Button>
            </div>
          </form>
        )}

        {step === 1 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline font-medium">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
