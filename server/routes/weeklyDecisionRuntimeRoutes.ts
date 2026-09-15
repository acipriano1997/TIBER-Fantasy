import express from 'express';
import { storage } from '../storage';
import {
  evaluateWeeklyDecisionRuntime,
  type WeeklyDecisionRuntimeInput,
} from '../services/weeklyDecisionRuntimeService';
import type { WeeklyDecisionPosture } from '../../shared/weeklyDecisionContract';

const POSTURES = new Set<WeeklyDecisionPosture>([
  'unset',
  'protect_downside',
  'balanced',
  'chase_spike',
]);

type WeeklyDecisionRuntimeRouteDeps = {
  storage: Pick<typeof storage, 'getUserLeagueContext'>;
  evaluateRuntime: typeof evaluateWeeklyDecisionRuntime;
};

const defaultDeps: WeeklyDecisionRuntimeRouteDeps = {
  storage,
  evaluateRuntime: evaluateWeeklyDecisionRuntime,
};

export function createWeeklyDecisionRuntimeRouter(
  deps: WeeklyDecisionRuntimeRouteDeps = defaultDeps,
) {
  const router = express.Router();

  router.post('/api/command-center/weekly/compare', async (req, res) => {
    try {
      const {
        user_id = 'default_user',
        week,
        starter_player_id,
        bench_player_id,
        operator_posture = 'unset',
      } = req.body ?? {};

      const parsedWeek = Number(week);
      if (!Number.isInteger(parsedWeek) || parsedWeek < 1 || parsedWeek > 25) {
        return res.status(400).json({
          success: false,
          error: 'week must be an integer from 1 through 25',
        });
      }
      if (typeof starter_player_id !== 'string' || !starter_player_id.trim()) {
        return res.status(400).json({ success: false, error: 'starter_player_id is required' });
      }
      if (typeof bench_player_id !== 'string' || !bench_player_id.trim()) {
        return res.status(400).json({ success: false, error: 'bench_player_id is required' });
      }
      if (!POSTURES.has(operator_posture as WeeklyDecisionPosture)) {
        return res.status(400).json({
          success: false,
          error: 'operator_posture must be unset, protect_downside, balanced, or chase_spike',
        });
      }

      const context = await deps.storage.getUserLeagueContext(String(user_id));
      const input: WeeklyDecisionRuntimeInput = {
        activeLeague: context.activeLeague,
        activeTeam: context.activeTeam,
        week: parsedWeek,
        starterPlayerId: starter_player_id.trim(),
        benchPlayerId: bench_player_id.trim(),
        operatorPosture: operator_posture as WeeklyDecisionPosture,
      };
      const runtime = await deps.evaluateRuntime(input);

      return res.json({
        success: true,
        runtime,
      });
    } catch (error) {
      console.error('❌ [Weekly Decision Runtime] compare failed:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assemble weekly decision runtime',
      });
    }
  });

  return router;
}

export const weeklyDecisionRuntimeRouter = createWeeklyDecisionRuntimeRouter();
