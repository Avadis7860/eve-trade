import React, { useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { DataHealthStatus, MarketDataQuality, MarketHub } from '../types';

interface MarketDataHealthProps {
  typeName: string;
  hubs: MarketHub[];
  qualities: Record<number, MarketDataQuality>;
  isSyncing: boolean;
  onRefresh: () => void;
}

interface StateMeta {
  label: string;
  tone: string;
  icon: React.ReactNode;
}

const STATE_META: Record<DataHealthStatus, StateMeta> = {
  LIVE: {
    label: 'LIVE',
    tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  CACHE: {
    label: 'CACHE',
    tone: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
    icon: <Database className="w-3.5 h-3.5" />,
  },
  STALE: {
    label: 'STALE',
    tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  PARTIAL: {
    label: 'PARTIEL',
    tone: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
    icon: <TriangleAlert className="w-3.5 h-3.5" />,
  },
  UNKNOWN: {
    label: 'INCONNU',
    tone: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
    icon: <TriangleAlert className="w-3.5 h-3.5" />,
  },
  ERROR: {
    label: 'ERREUR',
    tone: 'text-red-300 bg-red-500/10 border-red-500/30',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

function resolveHealth(quality?: MarketDataQuality): DataHealthStatus {
  if (!quality) return 'UNKNOWN';
  if (quality.health_status) return quality.health_status;

  if (quality.error_count > 0 && quality.orders_valid === 0) {
    return 'ERROR';
  }

  if (quality.completeness === 'partial') return 'PARTIAL';
  if (quality.source === 'cache' || quality.source === 'indexeddb') return 'CACHE';

  if (quality.freshness === 'stale' || quality.freshness === 'expired') {
    return 'STALE';
  }

  if (quality.source === 'esi' && quality.validation_status === 'valid') {
    return 'LIVE';
  }

  return 'UNKNOWN';
}

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  return Math.round(seconds / 3600) + 'h';
}

function formatDiagnostics(quality?: MarketDataQuality): string {
  if (!quality) return '';

  const parts: string[] = [];

  if (quality.last_http_status !== undefined) {
    parts.push('HTTP ' + quality.last_http_status);
  }
  if (quality.cache_status) {
    parts.push('cache ' + quality.cache_status);
  }
  if (quality.pages_fetched > 0 && quality.expected_pages > 0) {
    parts.push('pages ' + quality.pages_fetched + '/' + quality.expected_pages);
  }
  if (quality.esi_error_limit_remaining !== undefined) {
    parts.push('budget ESI ' + quality.esi_error_limit_remaining);
  }
  if (quality.retry_after_seconds !== undefined) {
    parts.push('retry ' + quality.retry_after_seconds + 's');
  }

  return parts.join(' · ');
}

export const MarketDataHealth: React.FC<MarketDataHealthProps> = ({
  typeName,
  hubs,
  qualities,
  isSyncing,
  onRefresh,
}) => {
  const states = useMemo(
    () =>
      hubs
        .filter((hub) => hub.active)
        .map((hub) => ({
          hub,
          quality: qualities[hub.region_id],
          health: resolveHealth(qualities[hub.region_id]),
        })),
    [hubs, qualities],
  );

  const aggregate = useMemo<DataHealthStatus>(() => {
    if (states.length === 0) return 'UNKNOWN';
    if (states.some((state) => state.health === 'ERROR')) return 'ERROR';
    if (states.some((state) => state.health === 'PARTIAL')) return 'PARTIAL';
    if (states.some((state) => state.health === 'STALE')) return 'STALE';
    if (states.some((state) => state.health === 'UNKNOWN')) return 'UNKNOWN';
    if (states.some((state) => state.health === 'CACHE')) return 'CACHE';
    return 'LIVE';
  }, [states]);

  if (states.length === 0) return null;

  const aggregateMeta = STATE_META[aggregate];
  const hasProblem =
    aggregate !== 'LIVE' ||
    states.some((state) => (state.quality?.error_count ?? 0) > 0);

  return (
    <section
      aria-label="État des données du marché"
      className={
        hasProblem
          ? 'bg-[#161821] border-b border-amber-500/20 px-4 sm:px-6 py-2.5'
          : 'bg-[#161821] border-b border-[#262730] px-4 sm:px-6 py-2'
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[#808495]">
            Données marché
          </span>
          <span
            className={
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ' +
              aggregateMeta.tone
            }
          >
            {aggregateMeta.icon}
            {aggregateMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {states.map(({ hub, quality, health }) => {
            const meta = STATE_META[health];
            const diagnostics = formatDiagnostics(quality);
            const title = quality?.last_error
              ? hub.name + ': ' + quality.last_error + (diagnostics ? ' · ' + diagnostics : '')
              : hub.name +
                ': ' +
                meta.label +
                ', âge ' +
                formatAge(quality?.age_seconds ?? 0) +
                ', ' +
                (quality?.orders_valid ?? 0) +
                ' ordres' +
                (diagnostics ? ' · ' + diagnostics : '');

            return (
              <span
                key={hub.id}
                title={title}
                aria-label={title}
                className={
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] ' +
                  meta.tone
                }
              >
                <span className="font-semibold">{hub.name}</span>
                <span className="opacity-80">{meta.label}</span>
                {quality && (
                  <span className="font-mono opacity-70">
                    {formatAge(quality.age_seconds)}
                  </span>
                )}
                {quality?.last_http_status !== undefined && (
                  <span className="font-mono opacity-60">
                    HTTP {quality.last_http_status}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasProblem && (
            <span className="hidden md:inline text-[10px] text-[#a0a4b5]">
              Une erreur marché ne signifie pas « aucun ordre ».
            </span>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#31333f] bg-[#0e1117] text-[10px] font-semibold text-[#cfd3dc] hover:text-white disabled:opacity-50 disabled:cursor-wait"
            title="Rafraîchir les données du marché"
          >
            <RefreshCw className={'w-3 h-3 ' + (isSyncing ? 'animate-spin' : '')} />
            {isSyncing ? 'Synchronisation…' : 'Actualiser'}
          </button>
        </div>
      </div>
    </section>
  );
};
