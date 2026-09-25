'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Check,
  Eye,
  LayoutTemplate,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { DEFAULT_CAMPAIGN_SIGNER_NAME, getCampaignTemplateMeta, resolveCampaignTemplateId, type EmailCampaignTemplateId } from '@noderails/common';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner, Table, Textarea } from '@/components/ui';
import { Alert, PageHeader, SegmentedControl } from '@/components/page';
import { CampaignEditor } from '@/components/campaign-editor';
import { CampaignHistoryDetail, type HistoryDetailTab } from '@/components/email/campaign-history-detail';
import { CampaignHistorySidebar, type HistoryStatusFilter } from '@/components/email/campaign-history-sidebar';
import { CampaignTemplatePicker } from '@/components/email/campaign-template-picker';
import { BucketMultiSelect } from '@/components/email/bucket-multi-select';
import { CampaignCtaEditor, CampaignCtaPlacementCanvas, createEmptyCta, type ComposeCta } from '@/components/email/campaign-cta-editor';
import { PersonCell, campaignTemplateLabel, choiceCardClass, formatWhen, sourceLabel } from '@/components/email/campaign-shared';

type Tab = 'people' | 'send' | 'history' | 'unsubscribes';
type Audience = 'EVERYONE' | 'REGISTERED_ACCOUNTS' | 'ADDED_CONTACTS' | 'SELECTED_PEOPLE' | 'BUCKETS';

interface PersonBucket {
  id: string;
  name: string;
}

interface EmailBucket {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

interface Person {
  key: string;
  email: string;
  name: string | null;
  source: 'REGISTERED' | 'ADDED';
  merchantId?: string;
  listContactId?: string;
  buckets?: PersonBucket[];
}

const FROM_META: Record<string, { label: string; hint: string }> = {
  'hello@example.com': { label: 'NodeRails', hint: 'Warm intros' },
  'updates@example.com': { label: 'NodeRails Updates', hint: 'Product news' },
  'business@example.com': { label: 'NodeRails Business', hint: 'Business updates' },
  'support@example.com': { label: 'NodeRails Support', hint: 'Helpful notes' },
  'security@example.com': { label: 'NodeRails Security', hint: 'Account alerts' },
};

type ResendMode = 'all' | 'undelivered' | 'selected';

function importSummary(result: { added: number; skipped: number; errors: Array<{ row: number; message: string }> }): string {
  const parts = [`Added ${result.added}`];
  if (result.skipped) parts.push(`skipped ${result.skipped} already on the list`);
  if (result.errors.length) parts.push(`${result.errors.length} invalid`);
  return `${parts.join('. ')}.`;
}

function parseTab(value: string | null): Tab {
  if (value === 'people' || value === 'history' || value === 'send' || value === 'unsubscribes') return value;
  return 'send';
}

const AUDIENCE_CARDS: Array<{ value: Audience; title: string; hint: string }> = [
  { value: 'EVERYONE', title: 'Everyone', hint: 'Registered + added' },
  { value: 'REGISTERED_ACCOUNTS', title: 'Registered', hint: 'Merchant accounts' },
  { value: 'ADDED_CONTACTS', title: 'Added', hint: 'Typed or CSV' },
  { value: 'SELECTED_PEOPLE', title: 'Selected', hint: 'Checked on People' },
  { value: 'BUCKETS', title: 'Buckets', hint: 'Any selected tags' },
];

export default function AdminEmailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EmailPageInner />
    </Suspense>
  );
}

function EmailPageInner() {
  const { token } = useAdminAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => parseTab(searchParams.get('tab')));
  const [selectedId, setSelectedIdState] = useState<string | null>(() => (
    parseTab(searchParams.get('tab')) === 'history' ? searchParams.get('campaign') : null
  ));
  const draftFromUrl = searchParams.get('draft');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [trackingPublic, setTrackingPublic] = useState<boolean | null>(null);

  const [peopleFilter, setPeopleFilter] = useState('all');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleBucketId, setPeopleBucketId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peopleStats, setPeopleStats] = useState<{ total: number; registered: number; added: number } | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addBucketIds, setAddBucketIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvBucketIds, setCsvBucketIds] = useState<string[]>([]);
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const [buckets, setBuckets] = useState<EmailBucket[]>([]);
  const [bucketName, setBucketName] = useState('');
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [editingBucketName, setEditingBucketName] = useState('');
  const [assignBucketId, setAssignBucketId] = useState('');
  const [unsubscribes, setUnsubscribes] = useState<any[]>([]);
  const [unsubTotal, setUnsubTotal] = useState(0);
  const [unsubSearch, setUnsubSearch] = useState('');
  const [unsubLoading, setUnsubLoading] = useState(false);

  const [fromAddresses, setFromAddresses] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<EmailCampaignTemplateId>('UPDATES');
  const [fromAddress, setFromAddress] = useState('updates@example.com');
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [ctas, setCtas] = useState<ComposeCta[]>([]);
  const [ctaLayout, setCtaLayout] = useState<'stack' | 'row'>('stack');
  const [showBackedBy, setShowBackedBy] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [audience, setAudience] = useState<Audience>('EVERYONE');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedBucketIds, setSelectedBucketIds] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewRefresh, setPreviewRefresh] = useState(0);
  const [showPlacementPanel, setShowPlacementPanel] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<{ count: number } | null>(null);
  const [audiencePreviewLoading, setAudiencePreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [resendMode, setResendMode] = useState<ResendMode | null>(null);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(() => (
    parseTab(searchParams.get('tab')) === 'send' ? draftFromUrl : null
  ));
  const [detail, setDetail] = useState<any | null>(null);
  const [activity, setActivity] = useState('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryDetailTab>('overview');
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null);
  const draftHydrated = useRef(false);

  const loadPeople = useCallback(async () => {
    if (!token) return;
    setPeopleLoading(true);
    try {
      const result = await api.getEmailPeople(token, {
        filter: peopleFilter,
        search: peopleSearch,
        ...(peopleBucketId ? { bucketId: peopleBucketId } : {}),
        page: '1',
        pageSize: '100',
      });
      setPeople(result.items ?? []);
      setPeopleTotal(result.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      setPeopleLoading(false);
    }
  }, [token, peopleFilter, peopleSearch, peopleBucketId]);

  const loadPeopleStats = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getEmailPeopleStats(token);
      setPeopleStats({
        total: result.total ?? 0,
        registered: result.registered ?? 0,
        added: result.added ?? 0,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load people stats');
    }
  }, [token]);

  const replaceNav = useCallback((nextTab: Tab, opts?: { campaignId?: string | null; draftId?: string | null }) => {
    setTabState(nextTab);
    const nextCampaign = nextTab === 'history'
      ? (opts && 'campaignId' in opts ? opts.campaignId ?? null : selectedId)
      : null;
    setSelectedIdState(nextCampaign);
    const params = new URLSearchParams();
    if (nextTab !== 'send' || opts?.draftId) params.set('tab', nextTab);
    if (nextTab === 'history' && nextCampaign) params.set('campaign', nextCampaign);
    if (nextTab === 'send' && opts?.draftId) params.set('draft', opts.draftId);
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, selectedId]);

  const setTab = (next: Tab) => replaceNav(next);
  const setSelectedId = (id: string) => replaceNav('history', { campaignId: id });

  const loadBuckets = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getEmailBuckets(token);
      setBuckets(result.buckets ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load buckets');
    }
  }, [token]);

  const loadUnsubscribes = useCallback(async () => {
    if (!token) return;
    setUnsubLoading(true);
    try {
      const result = await api.getEmailUnsubscribes(token, {
        search: unsubSearch,
        page: '1',
        pageSize: '50',
      });
      setUnsubscribes(result.items ?? []);
      setUnsubTotal(result.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load unsubscribes');
    } finally {
      setUnsubLoading(false);
    }
  }, [token, unsubSearch]);

  const loadFroms = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.getEmailFromAddresses(token);
      setFromAddresses(result.addresses ?? []);
      if (result.defaultFrom && !draftId) setFromAddress(result.defaultFrom);
      setTrackingPublic(result.trackingPublic ?? null);
    } catch {
      setFromAddresses(Object.keys(FROM_META));
    }
  }, [token, draftId]);

  const loadCampaigns = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return;
    if (!opts?.silent) setHistoryLoading(true);
    try {
      const result = await api.getEmailCampaigns(token, {
        page: String(historyPage),
        pageSize: '20',
        status: historyStatus,
        search: historySearch,
      });
      setCampaigns(result.items ?? []);
      setCampaignsTotal(result.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      if (!opts?.silent) setHistoryLoading(false);
    }
  }, [token, historyPage, historyStatus, historySearch]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    try {
      const result = await api.getEmailCampaign(token, id, {
        activity,
        search: activitySearch,
        page: '1',
        pageSize: '50',
      });
      setDetail(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    }
  }, [token, activity, activitySearch]);

  useEffect(() => {
    void loadPeople();
    void loadPeopleStats();
    void loadFroms();
    void loadBuckets();
  }, [loadPeople, loadPeopleStats, loadFroms, loadBuckets]);

  useEffect(() => {
    if (tab === 'history') void loadCampaigns();
    if (tab === 'unsubscribes') void loadUnsubscribes();
  }, [tab, loadCampaigns, loadUnsubscribes]);

  useEffect(() => {
    if (tab !== 'history' || selectedId || campaigns.length === 0) return;
    setSelectedId(campaigns[0].id);
  }, [tab, selectedId, campaigns, setSelectedId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    setSelectedRecipientIds(new Set());
  }, [selectedId]);

  useEffect(() => {
    if (tab !== 'history' || !selectedId) return;
    const timer = window.setInterval(() => {
      void loadCampaigns({ silent: true });
      void loadDetail(selectedId);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [tab, selectedId, loadCampaigns, loadDetail]);

  const togglePerson = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addPerson = async () => {
    if (!token) return;
    setError('');
    setAdding(true);
    try {
      const looksLikeList = /[,;\n]/.test(addEmail);
      if (looksLikeList) {
        const result = await api.importEmailPeople(
          token,
          addEmail,
          addBucketIds.length ? addBucketIds : undefined,
        );
        setCsvResult(result);
        setNotice(importSummary(result));
        setAddEmail('');
        setAddName('');
        await loadPeople();
        await loadPeopleStats();
        await loadBuckets();
        return;
      }
      const person = await api.addEmailPerson(token, {
        email: addEmail,
        name: addName || undefined,
        bucketIds: addBucketIds.length ? addBucketIds : undefined,
      });
      setAddEmail('');
      setAddName('');
      setNotice(person.alreadyOnList ? 'Already on the list. No duplicate added.' : 'Contact added to the directory.');
      await loadPeople();
      await loadPeopleStats();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add email');
    } finally {
      setAdding(false);
    }
  };

  const importCsv = async () => {
    if (!token) return;
    setError('');
    try {
      const result = await api.importEmailPeople(token, csvText, csvBucketIds.length ? csvBucketIds : undefined);
      setCsvResult(result);
      setNotice(importSummary(result));
      await loadPeople();
      await loadPeopleStats();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'CSV import failed');
    }
  };

  const removePerson = async (listContactId: string) => {
    if (!token) return;
    try {
      await api.deleteEmailPerson(token, listContactId);
      await loadPeople();
      await loadPeopleStats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove contact');
    }
  };

  const createBucket = async () => {
    if (!token || !bucketName.trim()) return;
    setError('');
    try {
      await api.createEmailBucket(token, bucketName.trim());
      setBucketName('');
      setNotice('Bucket created.');
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create bucket');
    }
  };

  const startRenameBucket = (bucket: EmailBucket) => {
    setEditingBucketId(bucket.id);
    setEditingBucketName(bucket.name);
  };

  const cancelRenameBucket = () => {
    setEditingBucketId(null);
    setEditingBucketName('');
  };

  const saveRenameBucket = async () => {
    if (!token || !editingBucketId || !editingBucketName.trim()) return;
    setError('');
    try {
      await api.renameEmailBucket(token, editingBucketId, editingBucketName.trim());
      setNotice('Bucket renamed.');
      cancelRenameBucket();
      await loadBuckets();
      await loadPeople();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not rename bucket');
    }
  };

  const removeBucket = async (id: string) => {
    if (!token) return;
    const bucket = buckets.find((item) => item.id === id);
    const label = bucket?.name ?? 'this bucket';
    if (!window.confirm(`Delete “${label}”? People stay in the directory; only the tag is removed.`)) return;
    try {
      await api.deleteEmailBucket(token, id);
      if (peopleBucketId === id) setPeopleBucketId('');
      if (editingBucketId === id) cancelRenameBucket();
      setSelectedBucketIds((prev) => prev.filter((bucketId) => bucketId !== id));
      await loadBuckets();
      await loadPeople();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete bucket');
    }
  };

  const addPersonToBucket = async (person: Person, bucketId: string) => {
    if (!token || !bucketId) return;
    const current = person.buckets?.map((bucket) => bucket.id) ?? [];
    if (current.includes(bucketId)) return;
    try {
      await api.setEmailPersonBuckets(token, person.email, [...current, bucketId]);
      await loadPeople();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add to bucket');
    }
  };

  const removePersonFromBucket = async (person: Person, bucketId: string) => {
    if (!token) return;
    const current = person.buckets?.map((bucket) => bucket.id) ?? [];
    if (!current.includes(bucketId)) return;
    try {
      await api.setEmailPersonBuckets(
        token,
        person.email,
        current.filter((id) => id !== bucketId),
      );
      await loadPeople();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove from bucket');
    }
  };

  const addSelectedToBucket = async () => {
    if (!token || !assignBucketId || selectedKeys.size === 0) return;
    try {
      await api.addEmailBucketMembers(token, assignBucketId, { personKeys: [...selectedKeys] });
      setNotice(`Added ${selectedKeys.size} people to the bucket.`);
      await loadPeople();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add people to bucket');
    }
  };

  const removeSelectedFromBucket = async (bucketId?: string) => {
    const targetBucketId = bucketId ?? peopleBucketId;
    if (!token || !targetBucketId || selectedKeys.size === 0) return;
    const emails = people.filter((person) => selectedKeys.has(person.key)).map((person) => person.email);
    if (!emails.length) return;
    try {
      const result = await api.removeEmailBucketMembers(token, targetBucketId, emails);
      setNotice(`Removed ${result.removed ?? emails.length} people from the bucket.`);
      await loadPeople();
      await loadBuckets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove people from bucket');
    }
  };

  const composePayload = () => ({
    fromAddress,
    templateId,
    subject,
    heading,
    body,
    ctaLabel: ctas[0]?.label || ctaLabel || undefined,
    ctaUrl: ctas[0]?.url || ctaUrl || undefined,
    ctas: ctas.length
      ? ctas.filter((c) => c.label.trim() && c.url.trim()).map((c) => ({
        id: c.id,
        label: c.label.trim(),
        url: c.url.trim(),
        placement: c.placement,
        style: c.style,
        align: c.align,
        withArrow: c.withArrow,
      }))
      : undefined,
    showBackedBy,
    ctaLayout,
    signerName: signerName || undefined,
    signerTitle: signerTitle || undefined,
    audience,
    personKeys: audience === 'SELECTED_PEOPLE' ? [...selectedKeys] : undefined,
    bucketIds: audience === 'BUCKETS' ? selectedBucketIds : undefined,
  });

  const saveDraft = async () => {
    if (!token) return null;
    setSaving(true);
    setError('');
    try {
      const payload = composePayload();
      const campaign = draftId
        ? await api.updateEmailCampaign(token, draftId, payload)
        : await api.createEmailCampaign(token, payload);
      const preview = await api.previewEmailCampaignAudience(token, campaign.id, {
        audience,
        personKeys: audience === 'SELECTED_PEOPLE' ? [...selectedKeys] : undefined,
        bucketIds: audience === 'BUCKETS' ? selectedBucketIds : undefined,
      });
      setAudiencePreview({ count: preview.count });
      setDraftId(campaign.id);
      replaceNav('send', { draftId: campaign.id });
      return campaign.id as string;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save draft');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const sendDraft = async () => {
    if (!token) return;
    const id = await saveDraft();
    if (!id || !token) return;
    setSaving(true);
    setError('');
    try {
      await api.sendEmailCampaign(token, id);
      setDraftId(null);
      setConfirmSend(false);
      replaceNav('history', { campaignId: id });
      setNotice('Campaign queued. Sends are rate-limited.');
      await loadCampaigns();
      await loadDetail(id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSaving(false);
    }
  };

  const loadDraftIntoEditor = (campaign: {
    id: string;
    fromAddress: string;
    templateId?: string;
    subject?: string;
    heading: string;
    body: string;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    ctas?: ComposeCta[] | null;
    ctaLayout?: string | null;
    showBackedBy?: boolean | null;
    signerName?: string | null;
    signerTitle?: string | null;
    audience: Audience;
    selectedPersonKeys?: string[] | null;
    selectedBucketIds?: string[] | null;
  }) => {
    setDraftId(campaign.id);
    const resolvedTemplate = resolveCampaignTemplateId(campaign.templateId);
    setTemplateId(resolvedTemplate);
    setFromAddress(campaign.fromAddress);
    setSubject(campaign.subject ?? '');
    setHeading(campaign.heading);
    setBody(campaign.body);
    setCtaLabel(campaign.ctaLabel ?? '');
    setCtaUrl(campaign.ctaUrl ?? '');
    if (Array.isArray(campaign.ctas) && campaign.ctas.length) {
      setCtas(campaign.ctas);
    } else if (campaign.ctaLabel && campaign.ctaUrl) {
      setCtas([{
        ...createEmptyCta(resolvedTemplate),
        label: campaign.ctaLabel,
        url: campaign.ctaUrl,
      }]);
    } else {
      setCtas([]);
    }
    setShowBackedBy(campaign.showBackedBy !== false);
    setCtaLayout(campaign.ctaLayout === 'row' ? 'row' : 'stack');
    setSignerName(campaign.signerName ?? '');
    setSignerTitle(campaign.signerTitle ?? '');
    setAudience(campaign.audience);
    setSelectedKeys(new Set(Array.isArray(campaign.selectedPersonKeys) ? campaign.selectedPersonKeys : []));
    setSelectedBucketIds(Array.isArray(campaign.selectedBucketIds) ? campaign.selectedBucketIds : []);
    setAudiencePreview(null);
    setConfirmSend(false);
  };

  useEffect(() => {
    if (!token || !draftId || draftHydrated.current) return;
    draftHydrated.current = true;
    void api.getEmailCampaign(token, draftId).then((campaign) => {
      if (campaign.status === 'DRAFT') loadDraftIntoEditor(campaign);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load draft');
    });
  }, [token, draftId]);

  const selectTemplate = (id: EmailCampaignTemplateId) => {
    setTemplateId(id);
    setFromAddress(getCampaignTemplateMeta(id).suggestedFrom);
  };

  const saveDraftExplicit = async () => {
    const id = await saveDraft();
    if (id) setNotice('Draft saved.');
  };

  const deleteDraft = async (id: string) => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteEmailCampaign(token, id);
      if (draftId === id) {
        setDraftId(null);
        draftHydrated.current = false;
      }
      if (selectedId === id) {
        setDetail(null);
        replaceNav('history', { campaignId: null });
      }
      setDeleteDraftId(null);
      setNotice('Draft deleted.');
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete draft');
    } finally {
      setSaving(false);
    }
  };

  const duplicateToEditor = async () => {
    if (!token || !selectedId) return;
    setSaving(true);
    setError('');
    try {
      const draft = await api.duplicateEmailCampaign(token, selectedId);
      loadDraftIntoEditor(draft);
      replaceNav('send', { draftId: draft.id });
      setNotice('Draft copied to Compose. Edit it and send when ready.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not duplicate campaign');
    } finally {
      setSaving(false);
    }
  };

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipientId)) next.delete(recipientId);
      else next.add(recipientId);
      return next;
    });
  };

  const resendCampaign = async () => {
    if (!token || !selectedId || !resendMode) return;
    setSaving(true);
    setError('');
    try {
      const payload = resendMode === 'selected'
        ? { targets: 'selected' as const, recipientIds: [...selectedRecipientIds] }
        : { targets: resendMode };
      const result = await api.resendEmailCampaign(token, selectedId, payload);
      setResendMode(null);
      setSelectedRecipientIds(new Set());
      setNotice(
        `Resend queued for ${result.resend?.queued ?? 0} recipients`
        + (result.resend?.skipped ? ` (${result.resend.skipped} still undeliverable)` : ''),
      );
      await loadCampaigns();
      await loadDetail(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!token) return;
    const id = await saveDraft();
    if (!id || !token) return;
    setSaving(true);
    try {
      const result = await api.testEmailCampaign(token, id);
      setNotice(`Test sent to ${result.to}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    const hasCopy = Boolean(heading.trim() || body.trim());
    const timer = window.setTimeout(() => {
      void api.previewEmailCampaignHtml(token, {
        fromAddress,
        templateId,
        heading: heading || undefined,
        body: body || undefined,
        ctaLabel: ctas[0]?.label || ctaLabel || undefined,
        ctaUrl: ctas[0]?.url || ctaUrl || undefined,
        ctas: ctas.length
          ? ctas.filter((c) => c.label.trim() && c.url.trim()).map((c) => ({
            id: c.id,
            label: c.label.trim(),
            url: c.url.trim(),
            placement: c.placement,
            style: c.style,
            align: c.align,
            withArrow: c.withArrow,
          }))
          : undefined,
        showBackedBy,
        ctaLayout,
        signerName: signerName || undefined,
        signerTitle: signerTitle || undefined,
      }).then((result) => setPreviewHtml(result.html ?? '')).catch(() => undefined);
    }, hasCopy ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [token, fromAddress, templateId, heading, body, ctas, ctaLabel, ctaUrl, showBackedBy, ctaLayout, signerName, signerTitle, previewRefresh]);

  const canSend = Boolean(heading.trim() && body.trim())
    && !saving
    && (audience !== 'BUCKETS' || selectedBucketIds.length > 0)
    && (audience !== 'SELECTED_PEOPLE' || selectedKeys.size > 0);
  const subjectLine = subject.trim() || heading.trim() || 'Untitled';
  const fromList = fromAddresses.length ? fromAddresses : Object.keys(FROM_META);
  const selectedAudience = AUDIENCE_CARDS.find((card) => card.value === audience);
  const selectedBucketNames = buckets.filter((bucket) => selectedBucketIds.includes(bucket.id)).map((bucket) => bucket.name);
  const selectedKeyFingerprint = [...selectedKeys].sort().join(',');
  const selectedBucketFingerprint = [...selectedBucketIds].sort().join(',');

  useEffect(() => {
    if (!token || tab !== 'send') return;
    if (audience === 'BUCKETS' && selectedBucketIds.length === 0) {
      setAudiencePreview({ count: 0 });
      return;
    }
    if (audience === 'SELECTED_PEOPLE' && selectedKeys.size === 0) {
      setAudiencePreview({ count: 0 });
      return;
    }
    const timer = window.setTimeout(() => {
      setAudiencePreviewLoading(true);
      void api.previewEmailCampaignAudience(token, draftId || 'compose', {
        audience,
        personKeys: audience === 'SELECTED_PEOPLE' ? [...selectedKeys] : undefined,
        bucketIds: audience === 'BUCKETS' ? selectedBucketIds : undefined,
      }).then((preview) => {
        setAudiencePreview({ count: preview.count });
      }).catch(() => undefined).finally(() => setAudiencePreviewLoading(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [token, tab, audience, selectedKeyFingerprint, selectedBucketFingerprint, draftId]);

  const applyCsvFile = (file?: File | null) => {
    if (!file) return;
    void file.text().then(setCsvText);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaigns"
        title="Emails"
        description="Compose updates, send to the people directory, and see who opened or clicked."
        actions={
          <SegmentedControl
            dark
            value={tab}
            onChange={setTab}
            options={[
              { value: 'send', label: 'Compose' },
              { value: 'people', label: 'People' },
              { value: 'history', label: 'History' },
              { value: 'unsubscribes', label: 'Unsubscribes' },
            ]}
          />
        }
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert tone="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
      {trackingPublic === false && (
        <Alert tone="info">
          Open tracking needs a public HTTPS API. Localhost pixels never load from Gmail. Set API_PUBLIC_URL to the public API and send from that API so the token exists in that database.
        </Alert>
      )}

      {tab === 'send' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(480px,560px)]">
          <div className="space-y-5">
            <Card className="space-y-4">
              <CampaignTemplatePicker value={templateId} onChange={selectTemplate} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">From</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {fromList.map((addr) => {
                    const meta = FROM_META[addr] ?? { label: addr.split('@')[0], hint: addr };
                    const active = fromAddress === addr;
                    return (
                      <button
                        key={addr}
                        type="button"
                        onClick={() => setFromAddress(addr)}
                        className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${choiceCardClass(active)}`}
                      >
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          active ? 'bg-white text-[#0a2540]' : 'border border-[#cfd6de] bg-white text-transparent'
                        }`}>
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span className="min-w-0">
                          <p className="text-sm font-semibold">{meta.label}</p>
                          <p className={`mt-0.5 truncate text-xs ${active ? 'text-white/70' : 'text-[#697386]'}`}>{addr}</p>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">Who this send goes to</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {AUDIENCE_CARDS.map((card) => {
                    const active = audience === card.value;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        onClick={() => setAudience(card.value)}
                        className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${choiceCardClass(active)}`}
                      >
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          active ? 'bg-white text-[#0a2540]' : 'border border-[#cfd6de] bg-white text-transparent'
                        }`}>
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span>
                          <p className="text-sm font-semibold">{card.title}</p>
                          <p className={`mt-0.5 text-xs ${active ? 'text-white/70' : 'text-[#697386]'}`}>{card.hint}</p>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {audience === 'SELECTED_PEOPLE' && (
                  <p className="mt-2 text-xs text-[#697386]">
                    {selectedKeys.size} selected on People.
                    <button type="button" className="ml-2 font-medium text-[#635bff]" onClick={() => setTab('people')}>
                      Choose people
                    </button>
                  </p>
                )}
                {audience === 'BUCKETS' && (
                  <div className="mt-3">
                    <BucketMultiSelect
                      buckets={buckets}
                      selected={selectedBucketIds}
                      onChange={setSelectedBucketIds}
                      label="Send to these buckets"
                      hint="Anyone in any selected bucket is included."
                      emptyHint="Create a bucket on People first."
                      placeholder="Choose buckets"
                    />
                    {buckets.length === 0 && (
                      <button type="button" className="mt-2 text-xs font-medium text-[#635bff]" onClick={() => setTab('people')}>
                        Open People
                      </button>
                    )}
                  </div>
                )}
                {(audiencePreview || audiencePreviewLoading) && (
                  <p className="mt-2 text-xs text-[#697386]">
                    {audiencePreviewLoading
                      ? 'Counting recipients…'
                      : `${audiencePreview?.count ?? 0} people in this audience. Some may be skipped at send.`}
                  </p>
                )}
              </div>
            </Card>

            <Card className="space-y-4">
              <Input
                label="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={heading.trim() || 'Defaults to the heading'}
              />
              <Input
                label="Heading"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="What’s new at NodeRails"
              />
              <CampaignEditor
                value={body}
                onChange={setBody}
                onUploadImage={async (file) => {
                  if (!token) throw new Error('Sign in again');
                  const uploaded = await api.uploadEmailCampaignImage(token, file);
                  return uploaded.url;
                }}
              />
              {templateId === 'DIRECT_OUTREACH' && (
                <div className="rounded-xl border border-[#e3e8ee] bg-[#fafbff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">Sign-off</p>
                    {(signerName.trim() || signerTitle.trim()) && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-[#635bff]"
                        onClick={() => {
                          setSignerName('');
                          setSignerTitle('');
                        }}
                      >
                        Use Business team
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#697386]">
                    Defaults to {DEFAULT_CAMPAIGN_SIGNER_NAME}, NodeRails. Add a name and optional title if you want a personal sign-off.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder={DEFAULT_CAMPAIGN_SIGNER_NAME}
                    />
                    <Input
                      label="Title"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      placeholder="CEO, CTO, optional"
                    />
                  </div>
                </div>
              )}
              <CampaignCtaEditor
                ctas={ctas}
                onChange={setCtas}
                ctaLayout={ctaLayout}
                onLayoutChange={setCtaLayout}
                templateId={templateId}
                showSignerSlot={templateId === 'DIRECT_OUTREACH'}
              />

              <label className="flex items-center gap-2 text-sm text-[#425466]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#635bff]"
                  checked={showBackedBy}
                  onChange={(e) => setShowBackedBy(e.target.checked)}
                />
                Show backed-by line in footer
              </label>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3e8ee] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs text-[#697386]">Chrome, footer, and unsubscribe stay in the NodeRails template.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!canSend} onClick={() => void saveDraftExplicit()}>
                  Save draft
                </Button>
                <Button size="sm" variant="secondary" disabled={!canSend} onClick={() => void sendTest()}>
                  <Mail className="h-3.5 w-3.5" />
                  Send test
                </Button>
                <Button size="sm" disabled={!canSend} onClick={() => setConfirmSend(true)}>
                  <Send className="h-3.5 w-3.5" />
                  Send campaign
                </Button>
              </div>
            </div>
          </div>

          <div className="xl:sticky xl:top-8 h-fit">
            <div className="overflow-hidden rounded-2xl border border-[#1b2430] bg-[#111827] shadow-[0_20px_50px_rgba(10,37,64,0.18)]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <p className="ml-2 min-w-0 flex-1 truncate text-xs text-white/60">{subjectLine}</p>
                {ctas.length > 0 && (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                      showPlacementPanel
                        ? 'bg-white/15 text-white'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                    onClick={() => setShowPlacementPanel((v) => !v)}
                    title="Place buttons in the email"
                  >
                    <LayoutTemplate className="h-3 w-3" />
                    {showPlacementPanel ? 'Hide placement' : 'Place buttons'}
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setPreviewRefresh((n) => n + 1)}
                  title="Refresh preview"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              </div>
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">From</p>
                <p className="mt-0.5 text-sm text-white">
                  {FROM_META[fromAddress]?.label ?? 'NodeRails'}
                </p>
              </div>
              {showPlacementPanel && ctas.length > 0 && (
                <div className="border-b border-white/10 bg-[#0d1219] p-3">
                  <CampaignCtaPlacementCanvas
                    ctas={ctas}
                    onChange={setCtas}
                    heading={heading}
                    showSignerSlot={templateId === 'DIRECT_OUTREACH'}
                    showBackedBy={showBackedBy}
                    ctaLayout={ctaLayout}
                  />
                </div>
              )}
              {previewHtml ? (
                <iframe title="Email preview" className="h-[min(78vh,820px)] w-full bg-white" srcDoc={previewHtml} />
              ) : (
                <div className="flex h-[min(60vh,520px)] flex-col items-center justify-center bg-[#f6f9fc] px-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#e3e8ee]">
                    <Eye className="h-5 w-5 text-[#635bff]" />
                  </div>
                  <p className="text-sm font-semibold text-[#0a2540]">Live preview</p>
                  <p className="mt-1 text-sm text-[#697386]">Choose a template to see the layout. Sample copy is shown until you write your own.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Total', value: peopleStats?.total, hint: 'Registered + added' },
              { label: 'Registered', value: peopleStats?.registered, hint: 'Merchant accounts' },
              { label: 'Added', value: peopleStats?.added, hint: 'Typed or CSV' },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#0a2540]">
                  {stat.value == null ? '—' : stat.value.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#697386]">{stat.hint}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0a2540]">Add one person</h2>
                <p className="mt-1 text-xs text-[#697386]">
                  We check disposable domains and MX before saving. Paste comma-separated emails here to import several. Duplicates are skipped.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input label="Email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="name@company.com" />
                <Input label="Name" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Optional" />
                <Button className="self-end" size="sm" onClick={() => void addPerson()} disabled={!addEmail.trim() || adding}>
                  Add
                </Button>
              </div>
              <BucketMultiSelect
                buckets={buckets}
                selected={addBucketIds}
                onChange={setAddBucketIds}
                label="Add to buckets"
                hint="Optional. New people are tagged with every selected bucket."
                placeholder="Choose buckets"
              />
            </Card>
            <Card className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0a2540]">Import CSV or emails</h2>
                <p className="mt-1 text-xs text-[#697386]">
                  Upload a file or paste addresses. Emails already on the list are skipped. Invalid rows are listed below.
                </p>
              </div>
              <div className="rounded-xl border border-[#e3e8ee] bg-[#fafbff] p-3">
                <BucketMultiSelect
                  buckets={buckets}
                  selected={csvBucketIds}
                  onChange={setCsvBucketIds}
                  label="Add imported people to buckets"
                  hint="Pick the buckets these emails should go into. Existing emails are skipped but still get these tags."
                  emptyHint="Create a bucket below first if you want imports tagged automatically."
                  placeholder="Choose one or more buckets"
                />
              </div>
              <div className="rounded-xl bg-[#f6f9fc] px-3 py-3 text-xs leading-relaxed text-[#425466]">
                <p className="font-semibold text-[#0a2540]">How to format</p>
                <p className="mt-2">CSV with a header. First row must include <code>email</code>. <code>name</code> is optional:</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-[#0a2540] ring-1 ring-[#e3e8ee]">{`email,name
alex@company.com,Alex Rivera
sam@company.com`}</pre>
                <p className="mt-2">Or paste emails only, comma-separated or one per line:</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-[#0a2540] ring-1 ring-[#e3e8ee]">{`alex@company.com, sam@company.com
jordan@company.com`}</pre>
              </div>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
                  csvDragging ? 'border-[#635bff] bg-[#f7f7ff]' : 'border-[#d1d8e0] bg-[#f6f9fc]'
                }`}
                onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setCsvDragging(false);
                  applyCsvFile(e.dataTransfer.files?.[0]);
                }}
              >
                <Upload className="h-4 w-4 text-[#635bff]" />
                <p className="mt-2 text-sm font-medium text-[#0a2540]">Drop a CSV or choose a file</p>
                <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => applyCsvFile(e.target.files?.[0])} />
              </label>
              <Textarea
                className="min-h-24 font-mono text-xs"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'email,name\nalex@company.com,Alex\n\nor alex@company.com, sam@company.com'}
              />
              <div className="flex items-center justify-between gap-3">
                {csvResult ? (
                  <p className="text-xs text-[#697386]">
                    Added {csvResult.added}. Skipped {csvResult.skipped} already on the list. {csvResult.errors.length} invalid.
                  </p>
                ) : <span />}
                <Button size="sm" variant="secondary" onClick={() => void importCsv()} disabled={!csvText.trim()}>
                  Import
                </Button>
              </div>
              {csvResult && csvResult.errors.length > 0 && (
                <div className="max-h-28 overflow-auto rounded-lg bg-[#fdf2f4] px-3 py-2 text-xs text-[#df1b41]">
                  {csvResult.errors.slice(0, 8).map((row) => (
                    <p key={`${row.row}-${row.message}`}>Row {row.row}: {row.message}</p>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#0a2540]">Buckets</h2>
                <p className="mt-1 text-xs text-[#697386]">
                  Tags like fav or business. One person can be in many buckets. Rename or delete anytime.
                </p>
              </div>
              <p className="text-xs text-[#697386]">{buckets.length} bucket{buckets.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                placeholder="New bucket name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void createBucket();
                  }
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => void createBucket()} disabled={!bucketName.trim()}>
                Create bucket
              </Button>
            </div>
            {buckets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d1d8e0] bg-[#f6f9fc] px-4 py-6 text-center">
                <p className="text-sm font-medium text-[#0a2540]">No buckets yet</p>
                <p className="mt-1 text-xs text-[#697386]">Create one to tag people for targeted sends.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-xl ring-1 ring-[#e3e8ee]">
                {buckets.map((bucket) => {
                  const isEditing = editingBucketId === bucket.id;
                  return (
                    <li key={bucket.id} className="flex flex-wrap items-center gap-3 bg-white px-3 py-2.5">
                      {isEditing ? (
                        <>
                          <div className="min-w-[12rem] flex-1">
                            <Input
                              value={editingBucketName}
                              onChange={(e) => setEditingBucketName(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void saveRenameBucket();
                                }
                                if (e.key === 'Escape') cancelRenameBucket();
                              }}
                            />
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => void saveRenameBucket()} disabled={!editingBucketName.trim()}>
                            <Check className="h-3.5 w-3.5" />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelRenameBucket}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#0a2540]">{bucket.name}</p>
                            <p className="text-xs text-[#697386]">
                              {bucket.memberCount} member{bucket.memberCount === 1 ? '' : 's'}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => startRenameBucket(bucket)} aria-label={`Rename ${bucket.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void removeBucket(bucket.id)} aria-label={`Delete ${bucket.name}`}>
                            <Trash2 className="h-3.5 w-3.5 text-[#df1b41]" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-[#e3e8ee]">
                {[
                  { value: 'all', label: 'All people' },
                  { value: 'registered', label: 'Registered' },
                  { value: 'added', label: 'Added' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPeopleFilter(opt.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      peopleFilter === opt.value ? 'bg-[#f0f0ff] text-[#635bff]' : 'text-[#425466]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {buckets.length > 0 && (
                <Select
                  className="w-48"
                  value={peopleBucketId}
                  onChange={(e) => setPeopleBucketId(e.target.value)}
                  options={[
                    { value: '', label: 'Any bucket' },
                    ...buckets.map((bucket) => ({
                      value: bucket.id,
                      label: `${bucket.name} (${bucket.memberCount})`,
                    })),
                  ]}
                />
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
              <input
                className="w-full rounded-lg border border-[#e3e8ee] bg-white py-2.5 pl-9 pr-3 text-sm text-[#0a2540] placeholder:text-[#a3acb9] focus:border-[#635bff] focus:outline-none focus:ring-2 focus:ring-[#635bff]/20"
                placeholder="Search email or name"
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
              />
            </div>
          </div>

          {selectedKeys.size > 0 && buckets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e8ee] bg-white px-3 py-2">
              <p className="text-xs text-[#697386]">{selectedKeys.size} selected</p>
              <Select
                value={assignBucketId}
                onChange={(e) => setAssignBucketId(e.target.value)}
                options={[
                  { value: '', label: 'Add to bucket' },
                  ...buckets.map((bucket) => ({ value: bucket.id, label: bucket.name })),
                ]}
              />
              <Button size="sm" variant="secondary" disabled={!assignBucketId} onClick={() => void addSelectedToBucket()}>
                Add to bucket
              </Button>
              {peopleBucketId && (
                <Button size="sm" variant="ghost" onClick={() => void removeSelectedFromBucket()}>
                  Remove from {buckets.find((bucket) => bucket.id === peopleBucketId)?.name ?? 'bucket'}
                </Button>
              )}
            </div>
          )}

          {peopleLoading ? <Spinner /> : people.length === 0 ? (
            <EmptyState icon={Users} title="No people yet" description="Registered merchants appear here. Add contacts by email or CSV." />
          ) : (
            <Table headers={['', 'Person', 'Source', 'Tags', '']}>
              {people.map((person) => {
                const assignedBuckets = person.buckets ?? [];
                const unassignedBuckets = buckets.filter(
                  (bucket) => !assignedBuckets.some((item) => item.id === bucket.id),
                );
                return (
                  <tr key={person.key} className="hover:bg-[#f6f9fc]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[#cfd6de] accent-[#635bff]"
                        checked={selectedKeys.has(person.key)}
                        onChange={() => togglePerson(person.key)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <PersonCell email={person.email} name={person.name} merchantId={person.merchantId} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={person.source === 'REGISTERED' ? 'default' : 'outline'}>
                        {person.source === 'REGISTERED' ? 'Registered' : 'Added'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {assignedBuckets.map((bucket) => (
                          <span
                            key={bucket.id}
                            className="inline-flex items-center gap-1 rounded-full bg-[#f0f0ff] px-2 py-0.5 text-[11px] font-medium text-[#635bff] ring-1 ring-[#d8d4ff]"
                          >
                            {bucket.name}
                            <button
                              type="button"
                              className="text-[#697386] hover:text-[#df1b41]"
                              onClick={() => void removePersonFromBucket(person, bucket.id)}
                              aria-label={`Remove ${bucket.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {unassignedBuckets.length > 0 && (
                          <select
                            className="rounded-full border border-[#e3e8ee] bg-white px-2 py-0.5 text-[11px] text-[#697386]"
                            defaultValue=""
                            onChange={(e) => {
                              const bucketId = e.target.value;
                              if (!bucketId) return;
                              void addPersonToBucket(person, bucketId);
                              e.currentTarget.value = '';
                            }}
                          >
                            <option value="">+ Tag</option>
                            {unassignedBuckets.map((bucket) => (
                              <option key={bucket.id} value={bucket.id}>{bucket.name}</option>
                            ))}
                          </select>
                        )}
                        {assignedBuckets.length === 0 && unassignedBuckets.length === 0 && (
                          <span className="text-xs text-[#697386]">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {person.listContactId ? (
                        <Button size="sm" variant="ghost" onClick={() => void removePerson(person.listContactId!)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="text-xs text-[#697386]">
            Showing {peopleTotal.toLocaleString()}
            {peopleStats ? ` of ${peopleStats.total.toLocaleString()} total` : ''}
            {' · '}
            {selectedKeys.size} selected for the next send
          </p>
        </div>
      )}

      {tab === 'unsubscribes' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#425466]">People who used Unsubscribe on a campaign email.</p>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
              <input
                className="w-full rounded-lg border border-[#e3e8ee] bg-white py-2.5 pl-9 pr-3 text-sm text-[#0a2540] placeholder:text-[#a3acb9] focus:border-[#635bff] focus:outline-none focus:ring-2 focus:ring-[#635bff]/20"
                placeholder="Search email"
                value={unsubSearch}
                onChange={(e) => setUnsubSearch(e.target.value)}
              />
            </div>
          </div>
          {unsubLoading ? <Spinner /> : unsubscribes.length === 0 ? (
            <EmptyState icon={Mail} title="No unsubscribes yet" description="One-click unsubscribe writes a campaign suppression here." />
          ) : (
            <Table headers={['Person', 'Source', 'Unsubscribed']}>
              {unsubscribes.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <PersonCell email={row.email} name={row.name} merchantId={row.merchantId} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{row.source ? sourceLabel(row.source) : 'Unknown'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#697386]">{formatWhen(row.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
          <p className="text-xs text-[#697386]">{unsubTotal} unsubscribed</p>
        </div>
      )}

      {tab === 'history' && (
        historyLoading && campaigns.length === 0 ? (
          <Spinner />
        ) : campaignsTotal === 0 && historyStatus === 'all' && !historySearch ? (
          <EmptyState
            icon={Mail}
            title="No campaigns yet"
            description="Compose a send to see open and click analytics here."
            action={<Button size="sm" onClick={() => setTab('send')}>Start a campaign</Button>}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e3e8ee] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:flex">
            <CampaignHistorySidebar
              campaigns={campaigns}
              selectedId={selectedId}
              status={historyStatus}
              search={historySearch}
              page={historyPage}
              total={campaignsTotal}
              pageSize={20}
              onSelect={setSelectedId}
              onStatusChange={(next) => { setHistoryStatus(next); setHistoryPage(1); }}
              onSearchChange={(next) => { setHistorySearch(next); setHistoryPage(1); }}
              onPageChange={setHistoryPage}
              onDeleteDraft={setDeleteDraftId}
            />
            {detail ? (
              <CampaignHistoryDetail
                detail={detail}
                tab={historyTab}
                activity={activity}
                activitySearch={activitySearch}
                selectedRecipientIds={selectedRecipientIds}
                saving={saving}
                onTabChange={setHistoryTab}
                onActivityChange={setActivity}
                onActivitySearchChange={setActivitySearch}
                onToggleRecipient={toggleRecipient}
                onEditDraft={() => {
                  loadDraftIntoEditor(detail);
                  replaceNav('send', { draftId: detail.id });
                }}
                onDeleteDraft={() => setDeleteDraftId(detail.id)}
                onDuplicate={() => void duplicateToEditor()}
                onResendAll={() => setResendMode('all')}
                onResendUndelivered={() => setResendMode('undelivered')}
                onResendSelected={() => setResendMode('selected')}
                onCancel={() => selectedId && void api.cancelEmailCampaign(token!, selectedId).then(() => loadDetail(selectedId))}
              />
            ) : (
              <div className="flex min-h-[640px] flex-1 items-center justify-center p-8">
                <EmptyState icon={Mail} title="Select a campaign" description="Pick a send from the list to see the preview, recipients, and links." />
              </div>
            )}
          </div>
        )
      )}

      {resendMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2540]/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_80px_rgba(10,37,64,0.28)]">
            <h3 className="text-lg font-semibold text-[#0a2540]">
              {resendMode === 'all' && 'Resend to everyone?'}
              {resendMode === 'undelivered' && 'Resend undelivered?'}
              {resendMode === 'selected' && `Resend to ${selectedRecipientIds.size} selected?`}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#697386]">
              {resendMode === 'all'
                && 'This re-queues every recipient on this campaign, including people who already received it. Each address is checked again before sending.'}
              {resendMode === 'undelivered'
                && 'This re-queues everyone who was skipped, failed, or cancelled. Each address is checked again for suppression, invalid format, disposable domains, and MX/DNS before sending.'}
              {resendMode === 'selected'
                && 'Only the selected recipients will be re-queued. Each address is checked again before sending.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResendMode(null)}>Cancel</Button>
              <Button disabled={saving} onClick={() => void resendCampaign()}>
                <Send className="h-4 w-4" />
                Resend now
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteDraftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2540]/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_80px_rgba(10,37,64,0.28)]">
            <h3 className="text-lg font-semibold text-[#0a2540]">Delete this draft?</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#697386]">
              This permanently removes the draft. Sent campaigns cannot be deleted here.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteDraftId(null)}>Cancel</Button>
              <Button variant="destructive" disabled={saving} onClick={() => void deleteDraft(deleteDraftId)}>
                Delete draft
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2540]/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_80px_rgba(10,37,64,0.28)]">
            <h3 className="text-lg font-semibold text-[#0a2540]">Send this campaign?</h3>
            <p className="mt-1 text-sm text-[#697386]">Check the summary, then queue the send.</p>
            <dl className="mt-4 divide-y divide-[#eef1f5] overflow-hidden rounded-xl border border-[#e3e8ee] bg-[#f8fafc]">
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">Subject</dt>
                <dd className="text-sm font-medium text-[#0a2540]">{subjectLine}</dd>
              </div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">Template</dt>
                <dd className="text-sm text-[#0a2540]">{campaignTemplateLabel(templateId)}</dd>
              </div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">From</dt>
                <dd className="text-sm text-[#0a2540]">
                  <p>{FROM_META[fromAddress]?.label ?? fromAddress}</p>
                  <p className="mt-0.5 text-xs text-[#697386]">{fromAddress}</p>
                </dd>
              </div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">Audience</dt>
                <dd className="text-sm text-[#0a2540]">
                  <p>{selectedAudience?.title ?? audience}</p>
                  <p className="mt-0.5 text-xs text-[#697386]">{selectedAudience?.hint}</p>
                  {audience === 'BUCKETS' && (
                    <p className="mt-1 text-sm text-[#0a2540]">
                      {selectedBucketNames.length ? selectedBucketNames.join(', ') : 'No buckets selected'}
                    </p>
                  )}
                  {audience === 'SELECTED_PEOPLE' && (
                    <p className="mt-1 text-sm text-[#0a2540]">{selectedKeys.size} people checked on People</p>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 bg-white px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#697386]">Total</dt>
                <dd className="text-sm font-semibold text-[#0a2540]">
                  {audiencePreviewLoading
                    ? 'Counting…'
                    : `${audiencePreview?.count ?? 0} emails will be queued`}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-[#697386]">
              Unsubscribed, invalid, or no-MX addresses are skipped at send. Delivery is rate-limited.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmSend(false)}>Cancel</Button>
              <Button
                disabled={saving || audiencePreviewLoading || (audiencePreview?.count ?? 0) < 1}
                onClick={() => void sendDraft()}
              >
                <Send className="h-4 w-4" />
                Send now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
