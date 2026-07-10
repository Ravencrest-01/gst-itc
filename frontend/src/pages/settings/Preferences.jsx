import React from 'react';
import { SettingsLayout } from './SettingsLayout';
import { usePreferences } from '../../context/PreferencesContext';
import { Card, CardBody } from '../../components/ui/Card';
import { Field, Select, Segmented } from '../../components/ui/Field';

export default function Preferences() {
  const { prefs, setPref } = usePreferences();

  return (
    <SettingsLayout title="Preferences" subtitle="Customize how ITC-Rec Engine looks and feels.">
      <Card>
        <CardBody className="space-y-6">
          <Field label="Theme" hint="Choose light or dark mode.">
            <Segmented
              value={prefs.theme}
              onChange={(v) => setPref('theme', v)}
              options={[
                { label: 'Light', value: 'light' },
                { label: 'Dark', value: 'dark' }
              ]}
              className="w-full sm:w-auto"
            />
          </Field>
          
          <div className="border-t border-border" />
          
          <Field label="Data Density" hint="How much data to show on screen at once.">
            <Segmented
              value={prefs.density}
              onChange={(v) => setPref('density', v)}
              options={[
                { label: 'Compact', value: 'compact' },
                { label: 'Comfortable', value: 'comfortable' }
              ]}
              className="w-full sm:w-auto"
            />
          </Field>

          <div className="border-t border-border" />

          <Field label="Default Financial Year" hint="This is the default selected FY in the topbar.">
            <Select 
              value={prefs.financialYear}
              onChange={(e) => setPref('financialYear', e.target.value)}
              className="max-w-xs"
            >
              <option value="2026-27">FY 2026-27</option>
              <option value="2025-26">FY 2025-26</option>
            </Select>
          </Field>
        </CardBody>
      </Card>
    </SettingsLayout>
  );
}
