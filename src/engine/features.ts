import { MarketObservation, HistoricalStats, MarketFeatureVector } from '../types';

/**
 * Pure deterministic feature engineering engine.
 * STRICT INVARIANT: Pure math only, no network, no browser state, no React.
 */
export class MarketFeatureEngine {
  /**
   * Generates a deterministic MarketFeatureVector from an ordered array of historical observations.
   */
  static extractFeatures(
    observations: MarketObservation[],
    history?: HistoricalStats,
    currentSpreadPct: number = 0,
    currentOrdersAhead: number = 0
  ): MarketFeatureVector {
    if (!observations || observations.length === 0) {
      return this.getDefaultFeatureVector(history, currentSpreadPct);
    }

    // Sort observations chronologically (oldest to newest)
    const sorted = [...observations].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );

    const newest = sorted[sorted.length - 1];
    const newestTime = new Date(newest.captured_at).getTime();

    // 1. Calculate Spread Momentum 1h and 24h
    let spread1hObs: MarketObservation | null = null;
    let spread24hObs: MarketObservation | null = null;

    const oneHourMs = 3600 * 1000;
    const oneDayMs = 24 * 3600 * 1000;

    for (const obs of sorted) {
      const ageMs = newestTime - new Date(obs.captured_at).getTime();
      if (ageMs >= oneHourMs && (!spread1hObs || ageMs < newestTime - new Date(spread1hObs.captured_at).getTime())) {
        spread1hObs = obs;
      }
      if (ageMs >= oneDayMs && (!spread24hObs || ageMs < newestTime - new Date(spread24hObs.captured_at).getTime())) {
        spread24hObs = obs;
      }
    }

    const currentObsSpread = newest.spread_pct !== undefined ? newest.spread_pct : currentSpreadPct;

    const spread1hValue = spread1hObs?.spread_pct !== undefined ? spread1hObs.spread_pct : sorted[0].spread_pct ?? currentObsSpread;
    const spread24hValue = spread24hObs?.spread_pct !== undefined ? spread24hObs.spread_pct : sorted[0].spread_pct ?? currentObsSpread;

    const spreadMomentum1h = Math.round((currentObsSpread - spread1hValue) * 100) / 100;
    const spreadMomentum24h = Math.round((currentObsSpread - spread24hValue) * 100) / 100;

    // 2. Volume Acceleration: 7d volume relative to 30d volume
    let volumeAcceleration = 1.0;
    if (history) {
      const vol7d = history.daily_volume_7d_median || history.daily_volume_7d_avg || 0;
      const vol30d = history.daily_volume_30d_median || history.daily_volume_30d_avg || 0;
      if (vol30d > 0 && vol7d > 0) {
        volumeAcceleration = Math.round((vol7d / vol30d) * 100) / 100;
      }
    }

    // 3. Competition Velocity (rate of change in orders per hour)
    let competitionVelocity = 0.0;
    if (sorted.length >= 2) {
      const oldest = sorted[0];
      const oldestTime = new Date(oldest.captured_at).getTime();
      const timeDeltaHours = Math.max(0.1, (newestTime - oldestTime) / (3600 * 1000));
      const ordersDelta = (newest.order_count_sell ?? currentOrdersAhead) - (oldest.order_count_sell ?? 0);
      competitionVelocity = Math.round((ordersDelta / timeDeltaHours) * 100) / 100;
    }

    // 4. Depth Velocity (visible volume change per hour)
    let depthVelocity = 0.0;
    if (sorted.length >= 2) {
      const oldest = sorted[0];
      const oldestTime = new Date(oldest.captured_at).getTime();
      const timeDeltaHours = Math.max(0.1, (newestTime - oldestTime) / (3600 * 1000));
      const depthDelta = (newest.sell_volume_visible ?? 0) - (oldest.sell_volume_visible ?? 0);
      depthVelocity = Math.round((depthDelta / timeDeltaHours) * 100) / 100;
    }

    // 5. Spread Persistence: fraction of observations where spread was strictly positive
    const profitableCount = sorted.filter((o) => (o.spread_pct !== undefined ? o.spread_pct > 0 : false)).length;
    const spreadPersistence = sorted.length > 0
      ? Math.round((profitableCount / sorted.length) * 100) / 100
      : (currentSpreadPct > 0 ? 1.0 : 0.0);

    // 6. Volatility Z-Score
    let volatilityZscore = 0.0;
    if (history && history.price_volatility > 0) {
      // Normalizing how far current spread deviates from zero relative to volatility
      const normalizedVol = Math.max(0.01, history.price_volatility);
      volatilityZscore = Math.round(((currentSpreadPct / 100) / normalizedVol) * 100) / 100;
    }

    return {
      spread_momentum_1h: spreadMomentum1h,
      spread_momentum_24h: spreadMomentum24h,
      volume_acceleration_7d_30d: volumeAcceleration,
      competition_velocity_orders: competitionVelocity,
      depth_velocity_volume: depthVelocity,
      spread_persistence_ratio: spreadPersistence,
      volatility_zscore: volatilityZscore,
      observations_count: sorted.length,
    };
  }

  /**
   * Fallback feature vector when no prior historical observations exist
   */
  private static getDefaultFeatureVector(
    history?: HistoricalStats,
    currentSpreadPct: number = 0
  ): MarketFeatureVector {
    let volumeAcceleration = 1.0;
    if (history) {
      const vol7d = history.daily_volume_7d_median || history.daily_volume_7d_avg || 0;
      const vol30d = history.daily_volume_30d_median || history.daily_volume_30d_avg || 0;
      if (vol30d > 0 && vol7d > 0) {
        volumeAcceleration = Math.round((vol7d / vol30d) * 100) / 100;
      }
    }

    let volatilityZscore = 0.0;
    if (history && history.price_volatility > 0) {
      volatilityZscore = Math.round(((currentSpreadPct / 100) / Math.max(0.01, history.price_volatility)) * 100) / 100;
    }

    return {
      spread_momentum_1h: 0,
      spread_momentum_24h: 0,
      volume_acceleration_7d_30d: volumeAcceleration,
      competition_velocity_orders: 0,
      depth_velocity_volume: 0,
      spread_persistence_ratio: currentSpreadPct > 0 ? 1.0 : 0.0,
      volatility_zscore: volatilityZscore,
      observations_count: 0,
    };
  }
}
