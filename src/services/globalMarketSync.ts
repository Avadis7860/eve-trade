import { EsiService } from './esi';
import { InterRegionalScanner } from './scanner';
import { TraderAnalyticsService } from './traderAnalytics';
import { MarketDataStore } from './marketDataStore';
import { IndexedDbStore } from './indexedDbStore';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { MAJOR_MARKET_HUBS } from '../data/universe';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  InterRegionalOpportunity,
  RawMarketOrder,
  HistoricalStats,
  GlobalSyncProgress,
  UniverseWideOpportunity,
} from '../types';

export interface GlobalSyncOptions {
  category_filter?:
    | 'all'
    | 'ships'
    | 'modules'
    | 'minerals_materials'
    | 'planetary_industry'
    | 'blueprints_reactions'
    | 'skills'
    | 'implants_boosters'
    | 'ammunition_charges'
    | 'drones_fighters'
    | 'trade_goods_plex'
    | 'structures_citadels'
    | 'subsystems_rigs'
    | 'deployables'
    | 'relics_exploration'
    | 'apparel'
    | string;
  category_id_filter?: number;
  item_limit?: number; // 25, 50, 100, 250, 500, or all
  fetch_history?: boolean; // also fetch 30-day ESI history
  concurrency?: number; // parallel requests (default 4)
  character_id?: number; // for personal trade history calibration
}

export class GlobalMarketSyncService {
  private static isRunning = false;
  private static isPaused = false;
  private static abortController: AbortController | null = null;
  private static universeOpportunities: UniverseWideOpportunity[] = [];
  private static latestRegionalOrders: Record<number, RawMarketOrder[]> = {};
  private static latestRegionalHistory: Record<number, HistoricalStats> = {};
  private static listeners: Array<(progress: GlobalSyncProgress) => void> = [];
  private static opportunityListeners: Array<(opps: UniverseWideOpportunity[]) => void> = [];

  private static progressState: GlobalSyncProgress = {
    is_running: false,
    is_paused: false,
    total_items: 0,
    completed_items: 0,
    successful_items: 0,
    failed_items: 0,
    total_orders_fetched: 0,
    total_opportunities_found: 0,
    percent: 0,
    elapsed_seconds: 0,
    estimated_remaining_seconds: 0,
    error_count: 0,
    last_updated: new Date().toISOString(),
  };

  /**
   * Hydrate opportunities from durable store on app startup
   */
  static async initFromStorage(): Promise<UniverseWideOpportunity[]> {
    if (this.universeOpportunities.length > 0) return this.universeOpportunities;
    try {
      const saved = await IndexedDbStore.loadUniverseOpportunities();
      if (saved && saved.length > 0) {
        this.universeOpportunities = saved;
        this.progressState.total_opportunities_found = saved.length;
        this.emitOpportunities();
      }
    } catch (e) {
      console.warn('Failed to load opportunities from storage:', e);
    }
    return this.universeOpportunities;
  }

  /**
   * Subscribe to progress updates
   */
  static subscribe(listener: (progress: GlobalSyncProgress) => void) {
    this.listeners.push(listener);
    listener({ ...this.progressState });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to live universe opportunity discoveries
   */
  static subscribeOpportunities(listener: (opps: UniverseWideOpportunity[]) => void) {
    this.opportunityListeners.push(listener);
    listener([...this.universeOpportunities]);
    return () => {
      this.opportunityListeners = this.opportunityListeners.filter((l) => l !== listener);
    };
  }

  private static emitProgress() {
    for (const l of this.listeners) {
      l({ ...this.progressState });
    }
  }

  private static emitOpportunities() {
    for (const l of this.opportunityListeners) {
      l([...this.universeOpportunities]);
    }
  }

  static getProgress(): GlobalSyncProgress {
    return { ...this.progressState };
  }

  static getUniverseOpportunities(): UniverseWideOpportunity[] {
    return [...this.universeOpportunities];
  }

  static getLatestRegionalOrders(): Record<number, RawMarketOrder[]> {
    return { ...this.latestRegionalOrders };
  }

  static getLatestRegionalHistory(): Record<number, HistoricalStats> {
    return { ...this.latestRegionalHistory };
  }

  /**
   * Pauses the sync
   */
  static pause() {
    if (this.isRunning) {
      this.isPaused = true;
      this.progressState.is_paused = true;
      this.emitProgress();
    }
  }

  /**
   * Resumes the sync
   */
  static resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.progressState.is_paused = false;
      this.emitProgress();
    }
  }

  /**
   * Stops/aborts the sync
   */
  static stop() {
    if (this.isRunning) {
      this.isRunning = false;
      this.isPaused = false;
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.progressState.is_running = false;
      this.progressState.is_paused = false;
      this.emitProgress();
    }
  }

  /**
   * Starts a resilient Global Universe Sync across all active hubs
   */
  static async startGlobalSync(
    hubs: MarketHub[],
    config: FinancialConfig,
    strategy: TradeStrategy,
    options: GlobalSyncOptions = {},
    customItems: EveTypeDetail[] = []
  ): Promise<UniverseWideOpportunity[]> {
    if (this.isRunning) {
      console.warn('Global sync is already running.');
      return this.universeOpportunities;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();

    // Load cached character metrics for personal calibration
    const userMetrics = options.character_id
      ? TraderAnalyticsService.getCachedMetrics(options.character_id)
      : null;

    // 1. Build Item List to sync: Single Source of Truth via CatalogRepository
    const catalogRepo = CatalogRepository.getInstance();
    if (customItems && customItems.length > 0) {
      for (const ci of customItems) {
        try {
          catalogRepo.registerCustomType(ci);
        } catch {}
      }
    }

    let targetItems: EveTypeDetail[] = catalogRepo.getAllTypes();

    // Apply specific category_id filter if provided
    if (options.category_id_filter && options.category_id_filter > 0) {
      targetItems = targetItems.filter((i) => i.category_id === options.category_id_filter);
    }
    // Apply named category filter
    else if (options.category_filter && options.category_filter !== 'all') {
      const filterKey = options.category_filter;
      if (filterKey === 'ships') {
        targetItems = targetItems.filter((i) => i.category_id === 6);
      } else if (filterKey === 'modules') {
        targetItems = targetItems.filter((i) => i.category_id === 7);
      } else if (filterKey === 'minerals_materials') {
        targetItems = targetItems.filter((i) => i.category_id === 4 || i.category_id === 25);
      } else if (filterKey === 'planetary_industry') {
        targetItems = targetItems.filter(
          (i) => i.category_id === 41 || i.category_id === 42 || i.category_id === 43
        );
      } else if (filterKey === 'blueprints_reactions') {
        targetItems = targetItems.filter((i) => i.category_id === 9 || i.category_id === 24);
      } else if (filterKey === 'skills') {
        targetItems = targetItems.filter((i) => i.category_id === 16);
      } else if (filterKey === 'implants_boosters') {
        targetItems = targetItems.filter((i) => i.category_id === 20);
      } else if (filterKey === 'ammunition_charges') {
        targetItems = targetItems.filter((i) => i.category_id === 8);
      } else if (filterKey === 'drones_fighters') {
        targetItems = targetItems.filter((i) => i.category_id === 18 || i.category_id === 87);
      } else if (filterKey === 'trade_goods_plex') {
        targetItems = targetItems.filter((i) => i.category_id === 17);
      } else if (filterKey === 'structures_citadels') {
        targetItems = targetItems.filter(
          (i) => i.category_id === 65 || i.category_id === 66 || i.category_id === 23 || i.category_id === 40
        );
      } else if (filterKey === 'subsystems_rigs') {
        targetItems = targetItems.filter((i) => i.category_id === 32 || i.group_id === 772 || i.group_id === 773);
      } else if (filterKey === 'deployables') {
        targetItems = targetItems.filter((i) => i.category_id === 22);
      } else if (filterKey === 'relics_exploration') {
        targetItems = targetItems.filter((i) => i.category_id === 34 || i.category_id === 35);
      } else if (filterKey === 'apparel') {
        targetItems = targetItems.filter((i) => i.category_id === 30);
      }
    }

    // Apply item limit if specified
    if (options.item_limit && options.item_limit > 0) {
      targetItems = targetItems.slice(0, options.item_limit);
    }

    const activeHubs = hubs.filter((h) => h.active);
    const totalItems = targetItems.length;
    const startTime = Date.now();

    this.progressState = {
      is_running: true,
      is_paused: false,
      total_items: totalItems,
      completed_items: 0,
      successful_items: 0,
      failed_items: 0,
      total_orders_fetched: 0,
      total_opportunities_found: 0,
      percent: 0,
      elapsed_seconds: 0,
      estimated_remaining_seconds: 0,
      error_count: 0,
      last_updated: new Date().toISOString(),
    };
    this.universeOpportunities = [];
    this.latestRegionalOrders = {};
    this.latestRegionalHistory = {};

    for (const hub of activeHubs) {
      this.latestRegionalOrders[hub.region_id] = [];
    }

    this.emitProgress();
    this.emitOpportunities();

    const concurrency = options.concurrency || 4;
    let completedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let totalOrdersAccumulator = 0;

    // Process items in chunks
    for (let i = 0; i < targetItems.length; i += concurrency) {
      if (!this.isRunning) break;

      // Handle pause loop
      while (this.isPaused && this.isRunning) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const chunk = targetItems.slice(i, i + concurrency);

      await Promise.all(
        chunk.map(async (item) => {
          if (!this.isRunning) return;

          this.progressState.current_item_name = item.name;
          this.emitProgress();

          const itemOrderBooks: Record<number, RawMarketOrder[]> = {};
          const itemHistoryCache: Record<number, HistoricalStats> = {};
          const itemQualities: Record<number, import('../types').MarketDataQuality> = {};
          let itemFailed = false;

          for (const hub of activeHubs) {
            try {
              const { orders, quality } = await EsiService.fetchLiveOrdersDetailed(hub.region_id, item.type_id);
              itemQualities[hub.region_id] = quality;

              if (orders.length > 0) {
                itemOrderBooks[hub.region_id] = orders;
                totalOrdersAccumulator += orders.length;
                MarketDataStore.setOrders(item.type_id, hub.region_id, orders, true, quality);
                if (!this.latestRegionalOrders[hub.region_id]) {
                  this.latestRegionalOrders[hub.region_id] = [];
                }
                this.latestRegionalOrders[hub.region_id].push(...orders);
              }

              if (options.fetch_history) {
                const hist = await EsiService.fetchMarketHistory(hub.region_id, item.type_id);
                if (hist) {
                  itemHistoryCache[hub.region_id] = hist;
                  MarketDataStore.setHistory(item.type_id, hub.region_id, hist);
                  this.latestRegionalHistory[hub.region_id] = hist;
                }
              }
            } catch (err) {
              itemFailed = true;
              this.progressState.error_count++;
            }
          }

          // Evaluate Arbitrage Opportunities for this item
          if (Object.keys(itemOrderBooks).length > 1) {
            try {
              const opps = InterRegionalScanner.scanItemAcrossHubs(
                item,
                activeHubs,
                strategy,
                config,
                itemOrderBooks,
                itemHistoryCache,
                itemQualities
              );

              if (opps.length > 0) {
                // Personal calibration fitting
                const personalFit = userMetrics
                  ? TraderAnalyticsService.calibrateOpportunity(item.type_id, item.category_id, userMetrics)
                  : undefined;

                for (const opp of opps) {
                  const calibratedOpp: UniverseWideOpportunity = {
                    ...opp,
                    item_name: item.name,
                    personal_fit: personalFit,
                  };

                  // If user has proven positive history on this item, boost overall score
                  if (personalFit && personalFit.calibration_confidence_boost !== 0) {
                    calibratedOpp.scores.overall_score = Math.min(
                      100,
                      Math.max(
                        0,
                        calibratedOpp.scores.overall_score * (1 + personalFit.calibration_confidence_boost)
                      )
                    );
                  }

                  this.universeOpportunities.push(calibratedOpp);
                }

                // Sort and keep top 300 highest scoring opportunities
                this.universeOpportunities.sort((a, b) => b.scores.overall_score - a.scores.overall_score);
                if (this.universeOpportunities.length > 300) {
                  this.universeOpportunities = this.universeOpportunities.slice(0, 300);
                }

                this.progressState.total_opportunities_found = this.universeOpportunities.length;
                this.emitOpportunities();
              }
            } catch (e) {
              console.warn(`Scanner error for ${item.name}:`, e);
            }
          }

          completedCount++;
          if (itemFailed) failedCount++;
          else successfulCount++;

          const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
          const rate = completedCount / elapsedSec;
          const remainingItems = totalItems - completedCount;
          const remainingSec = rate > 0 ? Math.round(remainingItems / rate) : 0;

          this.progressState.completed_items = completedCount;
          this.progressState.successful_items = successfulCount;
          this.progressState.failed_items = failedCount;
          this.progressState.percent = Math.round((completedCount / totalItems) * 100);
          this.progressState.total_orders_fetched = totalOrdersAccumulator;
          this.progressState.elapsed_seconds = elapsedSec;
          this.progressState.estimated_remaining_seconds = remainingSec;
          this.progressState.last_updated = new Date().toISOString();

          this.emitProgress();
        })
      );

      // Brief gentle throttle between concurrency batches (25ms)
      await new Promise((resolve) => setTimeout(resolve, 30));
      MarketDataStore.notifyListeners();
    }

    this.isRunning = false;
    this.isPaused = false;
    this.progressState.is_running = false;
    this.progressState.percent = 100;
    this.progressState.estimated_remaining_seconds = 0;
    this.emitProgress();
    MarketDataStore.notifyListeners();

    // Persist discovered opportunities into durable IndexedDB and localStorage
    IndexedDbStore.saveUniverseOpportunities(this.universeOpportunities).catch(() => {});
    try {
      localStorage.setItem('eve_last_global_sync', new Date().toISOString());
    } catch (e) {
      console.warn('Could not save sync timestamp:', e);
    }

    return this.universeOpportunities;
  }
}

