import type {
  PortfolioSnapshot,
  ProposedAllocationPosition,
  PortfolioTreasuryProvenance,
} from '../portfolio';
import type { CurrentPosition, TreasuryResolution } from '../financial';
import type { EveCharacterOrder } from '../character';
import type { UniverseWideOpportunity } from '../opportunity';

const treasury: TreasuryResolution = {
  source_mode: 'manual_budget',
  effective_capital: 1_000_000,
  label: 'Budget Fixe Alloué',
  is_corporation: false,
  capital_status: 'manual',
};

const treasuryProvenance: PortfolioTreasuryProvenance = {
  source_kind: 'MANUAL',
  source_id: 'manual_budget',
  principal_scope: 'manual',
};

const order = null as unknown as EveCharacterOrder;
const position = null as unknown as CurrentPosition;
const candidate = null as unknown as UniverseWideOpportunity;

const allocation: ProposedAllocationPosition = {
  opportunity: candidate,
  allocated_capital: 100_000,
  allocated_quantity: 10,
  projected_net_profit: 10_000,
  projected_roi: 0.1,
  expected_daily_profit: 1_000,
  expected_days_to_sell: 10,
  capital_provenance: treasuryProvenance,
  data_confidence: 0.9,
  prediction_confidence: 0.8,
  rationale: {
    rationale: ['cross-item candidate'],
    expected_profit_basis: 'CAPTURABLE_PROFIT',
    forecast_supported: true,
  },
};

// These accesses intentionally validate that the new model remains composition-oriented.
void treasury;
void order;
void position;
void allocation;

// Historical `PortfolioSimulation` fields are deliberately not part of the new
// Proposed Allocation contract.
// @ts-expect-error Portfolio truth must not expose the historical simulation aggregate directly.
void allocation.total_expected_profit;

// @ts-expect-error Whole-operation profitability is not a property of a proposed allocation position.
void allocation.net_realized_profit;

// A future consumer may compose the two independent Portfolio lenses at the root.
const snapshot = null as unknown as PortfolioSnapshot;
void snapshot;
