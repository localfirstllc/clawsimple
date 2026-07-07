'use client';

import { Input } from '@/components/ui/input';

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
};

type PlanBillingSummaryProps = {
  seatPlan: string;
  billingInterval: string;
  getSeatPlanLabel: (seatPlan: string) => string;
  getBillingIntervalLabel: (value: string) => string;
};

export function PlanBillingSummary({
  seatPlan,
  billingInterval,
  getSeatPlanLabel,
  getBillingIntervalLabel,
}: PlanBillingSummaryProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
      <div className="flex items-center justify-between">
        <span>Plan</span>
        <span className="font-medium">{getSeatPlanLabel(seatPlan)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span>Billing</span>
        <span className="font-medium">{getBillingIntervalLabel(billingInterval)}</span>
      </div>
    </div>
  );
}

type ManagedModelSectionProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: PresetModelOption[];
  disabled: boolean;
};

export function ManagedModelSection({
  id,
  value,
  onChange,
  options,
  disabled,
}: ManagedModelSectionProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        AI Model
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        disabled={disabled}
      >
        {options.length === 0 ? (
          <option value="" disabled>
            No preset models configured
          </option>
        ) : (
          options.map((model) => (
          <option key={model.model_id} value={model.model_id}>
            {model.display_name}
          </option>
          ))
        )}
      </select>
    </div>
  );
}

type TelegramTokenSectionProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

export function TelegramTokenSection({ id, value, onChange, disabled }: TelegramTokenSectionProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Telegram Bot Token
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Enter your bot token from @BotFather"
        disabled={disabled}
      />
    </div>
  );
}

type TelegramAllowlistSectionProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  readOnly: boolean;
  disabled: boolean;
  helperText: string;
};

export function TelegramAllowlistSection({
  id,
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  disabled,
  helperText,
}: TelegramAllowlistSectionProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
      />
      <p className="text-xs text-zinc-500">{helperText}</p>
    </div>
  );
}
