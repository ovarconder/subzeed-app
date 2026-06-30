import type { SubscriptionTier } from '@/lib/types';

const tierColors: Record<SubscriptionTier, string> = {
  free: 'bg-zinc-100 text-zinc-600',
  basic: 'bg-blue-100 text-blue-700',
  premium: 'bg-purple-100 text-purple-700',
  business_starter: 'bg-amber-100 text-amber-700',
  business_pro: 'bg-emerald-100 text-emerald-700',
  unlimited: 'bg-gradient-to-r from-pink-100 via-purple-100 to-indigo-100 text-indigo-700',
};

const tierLabels: Record<SubscriptionTier, string> = {
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
  business_starter: 'Business Starter',
  business_pro: 'Business Pro',
  unlimited: '♾️ Unlimited',
};

export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tierColors[tier]}`}>
      {tierLabels[tier]}
    </span>
  );
}

interface ProgressBarProps {
  used: number;
  total: number;
}

export function QuotaBar({ used, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isLow = percent > 80;
  const isExhausted = percent >= 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isExhausted ? 'bg-danger' : isLow ? 'bg-warning' : 'bg-success'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary whitespace-nowrap">
        {used.toFixed(1)}/{total.toFixed(1)} นาที
      </span>
    </div>
  );
}
