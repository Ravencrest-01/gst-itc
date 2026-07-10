import React, { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import * as membersApi from '../api/members';
import { PageHeader } from '../components/data/PageHeader';
import { Loading, ErrorState, Empty } from '../components/states/States';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Field';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../context/ToastContext';
import { Navigate } from 'react-router-dom';

export default function Team() {
  const { workspaceType } = useAuth();
  const toast = useToast();

  const { data: membersData, loading, error, reload } = useAsync(membersApi.list);
  const members = membersData?.items || [];

  const [isModalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  if (workspaceType === 'solo') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await membersApi.invite(email);
      toast.success('Invitation sent');
      setModalOpen(false);
      setEmail('');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await membersApi.remove(deleteId);
      toast.success('Member removed');
      await reload();
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setSubmitting(false);
      setDeleteId(null);
    }
  };

  if (loading && !membersData) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        title="Team Members"
        subtitle="Manage access to your firm's workspace."
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <span className="material-symbols-outlined mr-2">person_add</span>
            Invite member
          </Button>
        }
      />

      <Card>
        <CardBody flush>
          {members.length === 0 ? (
            <Empty 
              icon="group" 
              title="No team members" 
              message="Invite colleagues to collaborate on reconciliations."
              action={<Button variant="primary" onClick={() => setModalOpen(true)}>Invite member</Button>}
            />
          ) : (
            <table className="w-full text-sm ledger-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={member.full_name || member.email} size="sm" />
                        <div>
                          <p className="font-medium text-foreground">{member.full_name || 'Pending Invite'}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="capitalize">{member.role}</td>
                    <td>
                      <Badge tone={member.status === 'active' ? 'matched' : 'attention'}>
                        {member.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {member.role !== 'owner' && (
                          <button 
                            className="text-muted-foreground hover:text-destructive p-1"
                            onClick={() => setDeleteId(member.id)}
                            title="Remove"
                          >
                            <span className="material-symbols-outlined text-[20px]">person_remove</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Invite Member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleInvite} disabled={submitting || !email}>Send Invite</Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={handleInvite} className="space-y-4">
          <Field label="Email Address">
            <Input 
              type="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              placeholder="colleague@firm.com"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            They will receive an email with instructions to join your workspace.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        danger
        title="Remove member?"
        message="Are you sure you want to remove this member from the workspace? They will lose access to all client data immediately."
        busy={submitting}
      />
    </div>
  );
}
