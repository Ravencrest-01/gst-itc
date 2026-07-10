import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { requestOtp } from "@/api";
import { useNavigate } from "react-router-dom";

export function Register() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    full_name: "",
    workspace_name: "",
    email: "",
    password: "",
    otp: ""
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestOtp({ email: formData.email });
      setStep(2);
    } catch (error) {
      alert(error.response?.data?.detail || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({
        ...formData,
        workspace_type: "firm" // default for now
      });
      navigate("/dashboard");
    } catch (error) {
      alert(error.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground text-xl font-bold mb-4 shadow-sm">
            R
          </div>
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>
            {step === 1 ? "Sign up to start reconciling GST ITC" : "Enter the OTP sent to your email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="full_name">Full Name</label>
                <Input id="full_name" required placeholder="John Doe" value={formData.full_name} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="workspace_name">Workspace Name</label>
                <Input id="workspace_name" required placeholder="Your Company/Firm Name" value={formData.workspace_name} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="email">Email</label>
                <Input id="email" type="email" required placeholder="m@example.com" value={formData.email} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="password">Password</label>
                <Input id="password" type="password" required value={formData.password} onChange={handleChange} minLength={6} />
              </div>
              <Button className="w-full" type="submit" isLoading={loading}>
                Continue
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="otp">Enter 6-digit OTP</label>
                <Input id="otp" required placeholder="123456" value={formData.otp} onChange={handleChange} maxLength={6} />
              </div>
              <Button className="w-full" type="submit" isLoading={loading}>
                Complete Registration
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
            </form>
          )}
          
          {step === 1 && (
            <div className="mt-4 text-center text-sm">
              Already have an account? <a href="/login" className="underline underline-offset-4 hover:text-primary">Sign in</a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
