import { describe, expect, it } from 'vitest';
import {
  buildAgentRows,
  getPendingAgentState,
  getSeatQuotaUsage,
  mergeDeploymentData,
  type AddAgentPendingState,
  type DeploymentRow,
} from './profile-overview-helpers';

describe('mergeDeploymentData', () => {
  it('prefers full deployment fields but keeps backup_supported fallback order', () => {
    const deploy: DeploymentRow = {
      sid: 'sid_1',
      status: 'started',
      display_name: 'from-sub',
      backup_supported: false,
    };
    const fullDeploy: DeploymentRow = {
      sid: 'sid_1',
      status: 'completed',
      display_name: 'from-full',
      backup_supported: true,
    };
    const merged = mergeDeploymentData(deploy, fullDeploy);
    expect(merged.display_name).toBe('from-full');
    expect(merged.status).toBe('completed');
    expect(merged.backup_supported).toBe(false);
  });
});

describe('getSeatQuotaUsage', () => {
  it('computes usage and remaining fallback', () => {
    const usage = getSeatQuotaUsage('seat-standard', {
      sid: 'sid_1',
      status: 'completed',
      usage_estimated_usd: 6,
      usage_cap_usd: 10,
      usage_remaining_usd: null,
    });
    expect(usage.hasSeatQuotaUsage).toBe(true);
    expect(usage.usageEstimatedUsd).toBe(6);
    expect(usage.usageCapUsd).toBe(10);
    expect(usage.usageRemainingUsd).toBe(4);
    expect(usage.usagePercent).toBe(60);
  });
});

describe('pending/agent builders', () => {
  const addAgentPending: AddAgentPendingState = {
    agentId: 'agent_b',
    accountId: 'acc_b',
    model: 'gpt-5.2',
    runtime: 'hermes',
    jobId: 'job_1',
  };

  it('counts pending from server + local pending when not tracked by server', () => {
    const state = getPendingAgentState(
      {
        sid: 'sid_1',
        status: 'completed',
        additional_agents: [{ agent_id: 'agent_a', is_pending: true }],
      },
      addAgentPending
    );
    expect(state.localPendingAlreadyTracked).toBe(false);
    expect(state.pendingAgentCount).toBe(2);
  });

  it('builds agent rows with primary, existing, and local pending row', () => {
    const deployment: DeploymentRow = {
      sid: 'sid_1',
      status: 'completed',
      display_name: 'Main Name',
      last_model: 'gpt-5.2',
      additional_agents: [
        {
          agent_id: 'agent_a',
          display_name: 'Agent A',
          account_id: 'acc_a',
          model_preset: 'gemini-3-pro',
          is_pending: false,
        },
      ],
    };
    const rows = buildAgentRows('sid_1', deployment, addAgentPending, false);
    expect(rows).toHaveLength(3);
    expect(rows[0].agentId).toBe('main');
    expect(rows[1].agentId).toBe('agent_a');
    expect(rows[1].runtime).toBe('openclaw');
    expect(rows[2].isPending).toBe(true);
    expect(rows[2].runtime).toBe('hermes');
    expect(rows[2].name).toContain('(pending)');
  });

  it('prefers primary_agent_model over deployment last_model for the main agent row', () => {
    const deployment: DeploymentRow = {
      sid: 'sid_1',
      status: 'completed',
      primary_agent_model: 'openai/gpt-5.2',
      last_model: 'clawsimple/claude-sonnet-4-6',
    };
    const rows = buildAgentRows('sid_1', deployment);
    expect(rows[0].agentId).toBe('main');
    expect(rows[0].model).toBe('openai/gpt-5.2');
    expect(rows[0].runtime).toBe('openclaw');
  });
});
