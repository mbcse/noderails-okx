'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Spinner, Badge } from '@/components/ui';
import { Alert, PageHeader } from '@/components/page';
import { Percent, Shield, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';

const MAX_FEE_BPS = 1000; // 10% — matches contract MAX_FEE_BPS

function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  if (pct === Math.floor(pct)) return `${pct}%`;
  return `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;
}

// ── Fee Preview ──

function FeePreview({ feeBps }: { feeBps: number }) {
  const exampleAmounts = [10, 100, 500, 1000];

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-[#0a2540]">Fee Breakdown Example</h4>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {exampleAmounts.map((amount) => {
          const fee = (amount * feeBps) / 10000;
          const merchantReceives = amount - fee;
          return (
            <div key={amount} className="rounded-lg bg-[#f6f8fa] p-3 text-center">
              <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wider">
                ${amount} Payment
              </p>
              <p className="text-lg font-semibold text-[#0a2540] mt-1">
                ${merchantReceives.toFixed(2)}
              </p>
              <p className="text-[10px] text-[#a3acb9]">
                Merchant receives
              </p>
              <p className="text-xs text-[#697386] mt-1">
                ${fee.toFixed(2)} platform fee
              </p>
            </div>
          );
        })}
      </div>

      {/* Visual bar */}
      <div className="space-y-2">
        <div className="flex h-8 rounded-lg overflow-hidden border border-[#e3e8ee]">
          <div
            className="bg-[#edfcf2] flex items-center justify-center text-[10px] font-medium text-[#097c43] border-r border-[#b8ebc9]"
            style={{ width: `${100 - feeBps / 100}%` }}
          >
            Merchant: {bpsToPercent(10000 - feeBps)}
          </div>
          {feeBps > 0 && (
            <div
              className="bg-[#f0f0ff] flex items-center justify-center text-[10px] font-medium text-[#635bff]"
              style={{ width: `${feeBps / 100}%` }}
            >
              {feeBps >= 50 ? `Fee: ${bpsToPercent(feeBps)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Validation Warnings ──

function FeeWarnings({ feeBps }: { feeBps: number }) {
  const warnings: string[] = [];

  if (feeBps === 0) {
    warnings.push('Platform fee is 0% — no revenue will be collected from settlements.');
  }
  if (feeBps > 500) {
    warnings.push(`Fee is over 5% (${bpsToPercent(feeBps)}) — this may discourage merchant adoption.`);
  }
  if (feeBps > MAX_FEE_BPS) {
    warnings.push(`Fee exceeds the on-chain maximum of ${bpsToPercent(MAX_FEE_BPS)}. The contract will reject captures with this fee.`);
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-[#fef9ee] px-3 py-2 text-xs text-[#9e6c00]">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function FeeSettingsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [feeBps, setFeeBps] = useState(200); // default 2%
  const [savedFeeBps, setSavedFeeBps] = useState(200);
  const [conversionFeeBps, setConversionFeeBps] = useState(0);
  const [singleChainFeeBps, setSingleChainFeeBps] = useState(0);
  const [bankFeeBps, setBankFeeBps] = useState(0);
  const [swapQuoteTtlSeconds, setSwapQuoteTtlSeconds] = useState(120);
  const [savedVas, setSavedVas] = useState({
    conversionFeeBps: 0,
    singleChainSettlementFeeBps: 0,
    bankSettlementFeeBps: 0,
    swapQuoteTtlSeconds: 120,
  });

  const loadConfig = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const config = await api.getFeeConfig(token);
      setFeeBps(config.feeBps);
      setSavedFeeBps(config.feeBps);
      setConversionFeeBps(config.conversionFeeBps ?? 0);
      setSingleChainFeeBps(config.singleChainSettlementFeeBps ?? 0);
      setBankFeeBps(config.bankSettlementFeeBps ?? 0);
      setSwapQuoteTtlSeconds(config.swapQuoteTtlSeconds ?? 120);
      setSavedVas({
        conversionFeeBps: config.conversionFeeBps ?? 0,
        singleChainSettlementFeeBps: config.singleChainSettlementFeeBps ?? 0,
        bankSettlementFeeBps: config.bankSettlementFeeBps ?? 0,
        swapQuoteTtlSeconds: config.swapQuoteTtlSeconds ?? 120,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!token) return;
    setError(null);
    setSuccessMsg(null);

    if (feeBps < 0 || feeBps > MAX_FEE_BPS) {
      setError(`Fee must be between 0 and ${MAX_FEE_BPS} basis points (0% – ${bpsToPercent(MAX_FEE_BPS)})`);
      return;
    }
    if (!Number.isInteger(feeBps)) {
      setError('Fee must be a whole number of basis points');
      return;
    }
    if (swapQuoteTtlSeconds < 30 || swapQuoteTtlSeconds > 600) {
      setError('Quote TTL must be between 30 and 600 seconds');
      return;
    }

    try {
      setSaving(true);
      const result = await api.updateFeeConfig(token, {
        feeBps,
        conversionFeeBps,
        singleChainSettlementFeeBps: singleChainFeeBps,
        bankSettlementFeeBps: bankFeeBps,
        swapQuoteTtlSeconds,
      });
      setSavedFeeBps(result.feeBps);
      setSavedVas({
        conversionFeeBps: result.conversionFeeBps,
        singleChainSettlementFeeBps: result.singleChainSettlementFeeBps,
        bankSettlementFeeBps: result.bankSettlementFeeBps,
        swapQuoteTtlSeconds: result.swapQuoteTtlSeconds,
      });
      setSuccessMsg('Platform fee default updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFeeBps(savedFeeBps);
    setConversionFeeBps(savedVas.conversionFeeBps);
    setSingleChainFeeBps(savedVas.singleChainSettlementFeeBps);
    setBankFeeBps(savedVas.bankSettlementFeeBps);
    setSwapQuoteTtlSeconds(savedVas.swapQuoteTtlSeconds);
    setError(null);
    setSuccessMsg(null);
  };

  const hasChanges =
    feeBps !== savedFeeBps
    || conversionFeeBps !== savedVas.conversionFeeBps
    || singleChainFeeBps !== savedVas.singleChainSettlementFeeBps
    || bankFeeBps !== savedVas.bankSettlementFeeBps
    || swapQuoteTtlSeconds !== savedVas.swapQuoteTtlSeconds;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Platform fees"
        description="Settlement fee deducted on-chain. Per-merchant overrides live on the merchant detail page."
      />

      {/* Status badges */}
      <div className="flex items-center gap-3">
        <Badge variant="default">
          <Percent className="h-3 w-3 mr-1" /> Platform Default: {bpsToPercent(savedFeeBps)}
        </Badge>
        <Badge variant="outline">
          On-chain maximum: {bpsToPercent(MAX_FEE_BPS)}
        </Badge>
      </div>

      {/* Fee Preview */}
      <Card>
        <FeePreview feeBps={feeBps} />
      </Card>

      {/* Configuration Form */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0ff]">
            <Shield className="h-4 w-4 text-[#635bff]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0a2540]">Platform Fee Default</h3>
            <p className="text-xs text-[#697386]">Applied to all merchants without custom overrides</p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Fee (basis points)</label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0"
                max={MAX_FEE_BPS}
                step="1"
                value={feeBps}
                onChange={(e) => setFeeBps(parseInt(e.target.value) || 0)}
                className="flex-1"
              />
              <span className="text-sm font-medium text-[#697386] whitespace-nowrap">
                = {bpsToPercent(feeBps)}
              </span>
            </div>
            <p className="text-[10px] text-[#a3acb9]">
              1 basis point = 0.01%. Range: 0 – {MAX_FEE_BPS} bps (0% – {bpsToPercent(MAX_FEE_BPS)})
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '0%', bps: 0 },
                { label: '1%', bps: 100 },
                { label: '1.5%', bps: 150 },
                { label: '2%', bps: 200 },
                { label: '2.5%', bps: 250 },
                { label: '3%', bps: 300 },
                { label: '5%', bps: 500 },
              ].map((preset) => (
                <button
                  key={preset.bps}
                  onClick={() => setFeeBps(preset.bps)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    feeBps === preset.bps
                      ? 'bg-[#635bff] text-white'
                      : 'bg-[#f6f8fa] text-[#425466] hover:bg-[#e3e8ee]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-xs text-[#697386]">
          <p>
            <strong>Platform Fee:</strong> A percentage deducted from each payment at settlement
            time. The fee is included in the EIP-712 signed capture payload and enforced on-chain
            by the escrow contract.
          </p>
          <p>
            <strong>Fee Recipient:</strong> Fees are sent to the treasury address configured in
            the escrow contract. This address is set at deployment and can be updated by the
            contract Admin (not SuperAdmin).
          </p>
        </div>

        {/* Validation warnings */}
        <div className="mt-4">
          <FeeWarnings feeBps={feeBps} />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {successMsg && (
          <div className="mt-4">
            <Alert tone="success">{successMsg}</Alert>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Default Fee'}
          </Button>
          <Button variant="secondary" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0ff]">
            <Percent className="h-4 w-4 text-[#635bff]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0a2540]">VAS fees and quote TTL</h3>
            <p className="text-xs text-[#697386]">
              Published conversion, single-chain, and bank fees. These are snapshotted at authorize
              and deducted on dest. Merchant always receives 100 − platform − enabled VAS.
            </p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { label: 'Conversion fee (bps)', value: conversionFeeBps, set: setConversionFeeBps },
            { label: 'Single-chain settlement fee (bps)', value: singleChainFeeBps, set: setSingleChainFeeBps },
            { label: 'Bank settlement fee (bps)', value: bankFeeBps, set: setBankFeeBps },
          ].map((field) => (
            <div key={field.label} className="space-y-1.5">
              <label className="text-sm font-medium text-[#0a2540]">{field.label}</label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min="0"
                  max={MAX_FEE_BPS}
                  step="1"
                  value={field.value}
                  onChange={(e) => field.set(parseInt(e.target.value) || 0)}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-[#697386] whitespace-nowrap">
                  = {bpsToPercent(field.value)}
                </span>
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Swap quote TTL (seconds)</label>
            <Input
              type="number"
              min="30"
              max="600"
              step="1"
              value={swapQuoteTtlSeconds}
              onChange={(e) => setSwapQuoteTtlSeconds(parseInt(e.target.value) || 120)}
            />
            <p className="text-[10px] text-[#a3acb9]">Allowed range 30–600. Default 120.</p>
          </div>
        </div>
      </Card>

      {/* How it works */}
      <Card>
        <h3 className="text-sm font-semibold text-[#0a2540] mb-3">How Platform Fees Work</h3>
        <div className="space-y-3 text-xs text-[#425466] leading-relaxed">
          <p>
            The platform fee is a percentage of each payment that is collected at settlement time.
            Here&apos;s the flow:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 ml-2">
            <li>
              <strong>Capture</strong> — The fee percentage (in basis points) is included in the
              EIP-712 signed payload and recorded in the on-chain Payment struct.
            </li>
            <li>
              <strong>Settlement</strong> — The escrow contract splits the payment: the merchant
              receives (amount - fee), and the fee is sent to the treasury address.
            </li>
            <li>
              <strong>Refunds</strong> — If the payment is refunded, the full amount goes back
              to the payer. No fee is collected.
            </li>
            <li>
              <strong>Disputes</strong> — If the merchant wins, the fee is deducted as normal.
              If the payer wins, the full amount is refunded with no fee.
            </li>
          </ol>
          <p className="text-[#697386] italic">
            The on-chain contract enforces a maximum fee of {bpsToPercent(MAX_FEE_BPS)}.
            Per-merchant overrides can be configured from the merchant detail page.
          </p>
        </div>
      </Card>
    </div>
  );
}
