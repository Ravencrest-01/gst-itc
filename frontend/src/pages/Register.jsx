import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

export function Register() {
  const [formData, setFormData] = useState({
    full_name: "",
    workspace_name: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

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
            Sign up to start reconciling GST ITC
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
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
              Sign Up
            </Button>
          </form>
          
          <div className="mt-4 text-center text-sm">
            Already have an account? <a href="/login" className="underline underline-offset-4 hover:text-primary">Sign in</a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
