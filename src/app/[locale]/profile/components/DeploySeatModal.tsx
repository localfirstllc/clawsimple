'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { DeploymentForm } from '@/components/deploy/deployment-form';
import { DeploymentHelpModals } from '@/components/deploy/deployment-help-modals';
import type {
  BillingStatusResponse,
  DeployAgentRuntime,
  DeploySeatPlanChoice,
} from '@/hooks/use-deployment';

type Subscription = {
  seat_plan: 'seat-standard' | 'seat-max' | 'unknown';
  billing_interval: 'month' | 'year' | 'unknown';
  available_seats: number;
};

type PresetModelOption = {
  model_id: string;
  display_name: string;
  is_default?: boolean;
  unit_price_usd?: number;
};

type DeploySeatModalProps = {
  isOpen: boolean;
  deployModalSubscription: Subscription | null;
  closeDeployModal: () => void;
  deploySeatPlanChoice: DeploySeatPlanChoice;
  setDeploySeatPlanChoice: (value: DeploySeatPlanChoice) => void;
  deployBillingInterval: 'month' | 'year';
  setDeployBillingInterval: (value: 'month' | 'year') => void;
  hasSavedTelegramUserId: boolean;
  deployModelPreset: string;
  setDeployModelPreset: (value: string) => void;
  agentRuntime: DeployAgentRuntime;
  setAgentRuntime: (value: DeployAgentRuntime) => void;
  presetModelOptions: PresetModelOption[];
  defaultManagedModelPreset: string;
  isDeployingFromSeat: boolean;
  deployToken: string;
  setDeployToken: (value: string) => void;
  deployAllowlist: string;
  setDeployAllowlist: (value: string) => void;
  deployModalError: string | null;
  canSubmit: boolean;
  submitDeploy: (event: React.FormEvent) => Promise<void>;
};

const readyBillingStatus: BillingStatusResponse = {
  active: true,
  payment_ready: true,
  seat_availability: null,
  subscription: null,
};

export default function DeploySeatModal({
  isOpen,
  deployModalSubscription,
  closeDeployModal,
  deploySeatPlanChoice,
  setDeploySeatPlanChoice,
  deployBillingInterval,
  setDeployBillingInterval,
  hasSavedTelegramUserId,
  deployModelPreset,
  setDeployModelPreset,
  agentRuntime,
  setAgentRuntime,
  presetModelOptions,
  defaultManagedModelPreset,
  isDeployingFromSeat,
  deployToken,
  setDeployToken,
  deployAllowlist,
  setDeployAllowlist,
  deployModalError,
  canSubmit,
  submitDeploy,
}: DeploySeatModalProps) {
  const tCard = useTranslations('deploy.card');
  const tForm = useTranslations('deploy.form');
  const [helpOpen, setHelpOpen] = useState<'token' | 'allowlist' | null>(null);

  if (!isOpen) return null;

  const description =
    deployModalSubscription == null
      ? tCard('serverModal.genericDescription')
      : deployModalSubscription.available_seats > 0
        ? tCard('serverModal.useExistingSeat')
        : tCard('serverModal.addSeat');

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={closeDeployModal}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative max-h-[min(92vh,960px)] w-full max-w-4xl overflow-y-auto rounded-[28px] p-1"
        >
          <DeploymentForm
            title={tCard('stats.addDeployment')}
            description={description}
            tgToken={deployToken}
            setTgToken={setDeployToken}
            tgAllow={deployAllowlist}
            setTgAllow={setDeployAllowlist}
            modelPreset={deployModelPreset}
            setModelPreset={setDeployModelPreset}
            agentRuntime={agentRuntime}
            setAgentRuntime={setAgentRuntime}
            seatPlanChoice={deploySeatPlanChoice}
            setSeatPlanChoice={setDeploySeatPlanChoice}
            billingInterval={deployBillingInterval}
            setBillingInterval={setDeployBillingInterval}
            onOpenHelp={setHelpOpen}
            onSubmit={submitDeploy}
            isSubmitting={isDeployingFromSeat}
            canSubmit={canSubmit}
            billingStatus={readyBillingStatus}
            notice={null}
            error={deployModalError}
            promoCode=""
            setPromoCode={() => {}}
            promoStatus="idle"
            promoMessage={null}
            discount={null}
            validatePromoCode={() => {}}
            hasDeployments={false}
            modelOptions={presetModelOptions}
            defaultManagedModelPreset={defaultManagedModelPreset}
            hasSavedTelegramUserId={hasSavedTelegramUserId}
            isTelegramLoading={false}
            billingIntervalLocked={deployModalSubscription != null}
            seatPlanLocked={deployModalSubscription != null}
            hidePromoCode
            submitLabel={tForm('deployNow')}
          />
        </motion.div>
      </div>

      <DeploymentHelpModals openMode={helpOpen} onClose={() => setHelpOpen(null)} />
    </>
  );
}
