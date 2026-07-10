import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/Card";
import { Dropzone } from "@/components/ui/Dropzone";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/context/ToastContext";
import { createRun } from "@/api";
import { FileSpreadsheet, FileJson, Play } from "lucide-react";

export function NewRun() {
  const [prFile, setPrFile] = useState(null);
  const [gstr2bFile, setGstr2bFile] = useState(null);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleStartRun = async () => {
    if (!prFile || !gstr2bFile || !period) {
      toast({ title: "Validation Error", description: "Please upload both files and select a tax period.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("purchase_register", prFile);
      formData.append("gstr_2b", gstr2bFile);
      formData.append("tax_period", period);

      // In real life: await createRun(formData);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network
      
      toast({ title: "Run Started", description: "Reconciliation engine is processing your files." });
      navigate("/runs/latest");
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">New Reconciliation Run</h2>
        <p className="text-muted-foreground">Upload your Purchase Register and GSTR-2B to start the matching engine.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tax Period</CardTitle>
          <CardDescription>Select the filing month for this reconciliation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-xs">
            <option value="" disabled>Select Month...</option>
            <option value="2026-04">April 2026</option>
            <option value="2026-03">March 2026</option>
            <option value="2026-02">February 2026</option>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Purchase Register
            </CardTitle>
            <CardDescription>Your internal books (CSV or XLSX)</CardDescription>
          </CardHeader>
          <CardContent>
            {prFile ? (
              <div className="flex items-center justify-between p-4 rounded-md border bg-muted/50">
                <span className="text-sm font-medium truncate">{prFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setPrFile(null)}>Remove</Button>
              </div>
            ) : (
              <Dropzone onDrop={setPrFile} accept=".csv, .xlsx" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              GSTR-2B
            </CardTitle>
            <CardDescription>Portal auto-draft (JSON or XLSX)</CardDescription>
          </CardHeader>
          <CardContent>
            {gstr2bFile ? (
              <div className="flex items-center justify-between p-4 rounded-md border bg-muted/50">
                <span className="text-sm font-medium truncate">{gstr2bFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setGstr2bFile(null)}>Remove</Button>
              </div>
            ) : (
              <Dropzone onDrop={setGstr2bFile} accept=".json, .xlsx" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleStartRun} isLoading={loading}>
          <Play className="mr-2 h-4 w-4" />
          Run Reconciliation Engine
        </Button>
      </div>
    </div>
  );
}
