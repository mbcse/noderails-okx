'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import type { ShortLinkRow } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Input, Spinner, Toggle } from '@/components/ui';
import { Alert, Modal, PageHeader } from '@/components/page';
import {
  BarChart3,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

function shortenDisplay(url: string, max = 56) {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

export default function ShortLinksPage() {
  const { token } = useAdminAuth();
  const [links, setLinks] = useState<ShortLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShortLinkRow | null>(null);
  const [editForm, setEditForm] = useState({
    destinationUrl: '',
    title: '',
    collectEmail: false,
    requirePassword: false,
    password: '',
    clearPassword: false,
  });
  const [form, setForm] = useState({
    slug: '',
    destinationUrl: '',
    title: '',
    collectEmail: false,
    requirePassword: false,
    password: '',
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLinks(await api.getShortLinks(token));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({
      slug: '',
      destinationUrl: '',
      title: '',
      collectEmail: false,
      requirePassword: false,
      password: '',
    });
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (form.requirePassword && form.password.trim().length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createShortLink(token, {
        slug: form.slug.trim().toLowerCase(),
        destinationUrl: form.destinationUrl.trim(),
        title: form.title.trim() || null,
        collectEmail: form.collectEmail,
        ...(form.requirePassword && form.password.trim()
          ? { password: form.password.trim() }
          : {}),
      });
      resetForm();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (link: ShortLinkRow) => {
    if (!token) return;
    try {
      await api.updateShortLink(token, link.id, {
        status: link.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (link: ShortLinkRow) => {
    if (!token || !confirm(`Delete ${link.publicUrl}? This cannot be undone.`)) return;
    try {
      await api.deleteShortLink(token, link.id);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEdit = (link: ShortLinkRow) => {
    setEditing(link);
    setEditForm({
      destinationUrl: link.destinationUrl,
      title: link.title ?? '',
      collectEmail: link.collectEmail,
      requirePassword: link.hasPassword,
      password: '',
      clearPassword: false,
    });
    setError('');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editing) return;
    if (editForm.requirePassword && !editing.hasPassword && editForm.password.trim().length < 4) {
      setError('Set a password of at least 4 characters');
      return;
    }
    if (editForm.requirePassword && editForm.password.trim() && editForm.password.trim().length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        destinationUrl: editForm.destinationUrl.trim(),
        title: editForm.title.trim() || null,
        collectEmail: editForm.collectEmail,
      };
      if (!editForm.requirePassword && editing.hasPassword) {
        payload.clearPassword = true;
      } else if (editForm.requirePassword && editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }
      await api.updateShortLink(token, editing.id, payload);
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setError('Could not copy');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Links"
        description="Create branded redirects. Public URLs look like https://example.local/link/your-slug."
        actions={
          !showForm ? (
            <Button
              onClick={() => {
                setShowForm(true);
                setError('');
              }}
            >
              <Plus className="h-4 w-4" /> New link
            </Button>
          ) : undefined
        }
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      {showForm && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e8edf3] px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#0a2540]">Create link</h2>
              <p className="mt-0.5 text-sm text-[#697386]">Slug is permanent after create.</p>
            </div>
            <button type="button" onClick={resetForm} className="rounded-lg p-2 text-[#a3acb9] hover:bg-[#f6f9fc] hover:text-[#425466]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#425466]">Public URL</label>
              <div className="flex overflow-hidden rounded-xl border border-[#e3e8ee] bg-white focus-within:border-[#635bff] focus-within:ring-2 focus-within:ring-[#635bff]/20">
                <span className="shrink-0 border-r border-[#e3e8ee] bg-[#f7fafc] px-3 py-2.5 text-sm text-[#697386]">
                  https://example.local/link/
                </span>
                <input
                  className="min-w-0 flex-1 px-3 py-2.5 text-sm text-[#0a2540] outline-none"
                  placeholder="summer-launch"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    })
                  }
                  required
                  minLength={2}
                  maxLength={64}
                  pattern="[a-z0-9][a-z0-9-]{1,63}"
                />
              </div>
              {form.slug && (
                <p className="mt-2 break-all font-mono text-xs text-[#635bff]">
                  https://example.local/link/{form.slug}
                </p>
              )}
            </div>

            <Input
              label="Destination URL"
              placeholder="https://example.com/page"
              value={form.destinationUrl}
              onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
              required
            />
            <Input
              label="Title (optional)"
              placeholder="Summer launch"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
            />
            <Toggle
              checked={form.collectEmail}
              onChange={(checked) => setForm({ ...form, collectEmail: checked })}
              label="Ask for email before redirect"
            />
            <Toggle
              checked={form.requirePassword}
              onChange={(checked) => setForm({ ...form, requirePassword: checked, password: checked ? form.password : '' })}
              label="Require password before redirect"
            />
            {form.requirePassword && (
              <Input
                label="Password"
                type="password"
                placeholder="At least 4 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={4}
                maxLength={128}
              />
            )}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create link
              </Button>
            </div>
          </form>
        </Card>
      )}

      {links.length === 0 ? (
        <EmptyState
          title="No links yet"
          description="Create a short link to start tracking clicks and emails."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> New link
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <Card key={link.id} className="!p-0 overflow-hidden">
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={link.status === 'ACTIVE' ? 'success' : 'outline'}>
                      {link.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                    </Badge>
                    {link.collectEmail && <Badge variant="default">Email gate</Badge>}
                    {link.hasPassword && <Badge variant="warning">Password</Badge>}
                    {link.title && (
                      <span className="text-sm font-medium text-[#0a2540]">{link.title}</span>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#697386]">
                      Public URL
                    </p>
                    <div className="group relative">
                      <Link
                        href={`/dashboard/links/${link.id}`}
                        className="block break-all font-mono text-sm font-medium text-[#635bff] hover:underline"
                        title={link.publicUrl}
                      >
                        <span className="lg:hidden">{link.publicUrl}</span>
                        <span className="hidden lg:inline group-hover:hidden">
                          {shortenDisplay(link.publicUrl, 64)}
                        </span>
                        <span className="hidden lg:group-hover:inline">{link.publicUrl}</span>
                      </Link>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#697386]">
                      Destination
                    </p>
                    <button
                      type="button"
                      onClick={() => openEdit(link)}
                      className="group block max-w-full text-left"
                      title={link.destinationUrl}
                    >
                      <span className="break-all text-sm text-[#425466] group-hover:text-[#635bff]">
                        <span className="lg:hidden">{link.destinationUrl}</span>
                        <span className="hidden lg:inline group-hover:hidden">
                          {shortenDisplay(link.destinationUrl, 72)}
                        </span>
                        <span className="hidden lg:group-hover:inline">{link.destinationUrl}</span>
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-[#697386]">
                    <span>
                      <span className="font-semibold text-[#0a2540]">{link.clickCount}</span> clicks
                    </span>
                    <span>
                      <span className="font-semibold text-[#0a2540]">{link.leadCount}</span> emails
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
                  <div className="mb-1 flex items-center justify-between gap-3 lg:mb-2">
                    <Toggle
                      checked={link.status === 'ACTIVE'}
                      onChange={() => handleToggle(link)}
                      label={link.status === 'ACTIVE' ? 'On' : 'Off'}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyUrl(link.id, link.publicUrl)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === link.id ? 'Copied' : 'Copy'}
                    </Button>
                    <a href={link.publicUrl} target="_blank" rel="noreferrer">
                      <Button variant="secondary" size="sm" type="button">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </Button>
                    </a>
                    <Link href={`/dashboard/links/${link.id}`}>
                      <Button variant="secondary" size="sm" type="button">
                        <BarChart3 className="h-3.5 w-3.5" /> Analytics
                      </Button>
                    </Link>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(link)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(link)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title="Edit destination"
          description={editing.publicUrl}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="rounded-xl border border-[#e8edf3] bg-[#f7fafc] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">Public URL</p>
              <p className="mt-1 break-all font-mono text-xs text-[#0a2540]">{editing.publicUrl}</p>
            </div>
            <Input
              label="Destination URL (https)"
              value={editForm.destinationUrl}
              onChange={(e) => setEditForm({ ...editForm, destinationUrl: e.target.value })}
              required
            />
            <Input
              label="Title (optional)"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              maxLength={200}
            />
            <Toggle
              checked={editForm.collectEmail}
              onChange={(checked) => setEditForm({ ...editForm, collectEmail: checked })}
              label="Ask for email before redirect"
            />
            <Toggle
              checked={editForm.requirePassword}
              onChange={(checked) =>
                setEditForm({
                  ...editForm,
                  requirePassword: checked,
                  password: checked ? editForm.password : '',
                  clearPassword: !checked && Boolean(editing?.hasPassword),
                })
              }
              label="Require password before redirect"
            />
            {editForm.requirePassword && (
              <Input
                label={editing?.hasPassword ? 'New password (leave blank to keep current)' : 'Password'}
                type="password"
                placeholder="At least 4 characters"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                minLength={editing?.hasPassword ? undefined : 4}
                maxLength={128}
                required={!editing?.hasPassword}
              />
            )}
            {!editForm.requirePassword && editing?.hasPassword && (
              <p className="text-xs text-[#697386]">Saving will remove the password gate.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
