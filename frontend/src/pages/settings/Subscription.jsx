import React from 'react';
import { SettingsLayout } from './SettingsLayout';
import { useAsync } from '../../hooks/useAsync';
import * as workspaceApi from '../../api/workspace';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Loading, ErrorState, Empty } from '../../components/states/States';
import { formatMoney } from '../../lib/format';

export default function Subscription() {
  const { data: sub, loading, error } = useAsync(workspaceApi.getSubscription);

  if (loading) return <SettingsLayout title="Subscription"><Loading /></SettingsLayout>;
  if (error) return <SettingsLayout title="Subscription"><ErrorState error={error} /></SettingsLayout>;

  return (
    <SettingsLayout title="Subscription" subtitle="Manage your billing and plan.">
      <Card>
        <CardHead 
          title="Current Plan" 
          actions={
            sub?.status === 'active' && (
              <Badge tone="matched">Active</Badge>
            )
          }
        />
        <CardBody>
          {!sub ? (
            <Empty 
              title="No active subscription" 
              message="You are currently on a free trial or do not have an active subscription."
              action={<Button variant="primary">Upgrade now</Button>}
            />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Plan</p>
                  <p className="text-lg font-semibold text-foreground capitalize">{sub.plan_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Billing period</p>
                  <p className="text-lg font-semibold text-foreground capitalize">{sub.billing_period}</p>
                </div>
              </div>
              
              <div className="border-t border-border" />
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Next billing date</p>
                  <p className="text-foreground">{new Date(sub.current_period_end).toLocaleDateString()}</p>
                </div>
                <Button variant="ghost">Manage billing</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </SettingsLayout>
  );
}
