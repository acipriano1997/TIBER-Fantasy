import express, { type Request, type Response } from 'express';

export const SLEEPER_USAGE_UNAVAILABLE_CODE = 'SLEEPER_USAGE_UNAVAILABLE' as const;

/**
 * Release quarantine for the legacy /api/sleeper/stats/:playerId handler.
 *
 * Sleeper does not provide the snap/route/target-share packet that the legacy
 * route pretended to fetch. That handler generated random position-shaped
 * values and, on failure, fixed fallback values. The personal v1 runtime must
 * never surface those as observed usage. Mount this router before the legacy
 * route graph so the active endpoint fails closed until a verified source owns
 * the data contract.
 */
export const sleeperUsageTruthBoundaryRouter = express.Router();

sleeperUsageTruthBoundaryRouter.get(
  '/api/sleeper/stats/:playerId',
  (req: Request, res: Response) => {
    const playerId = req.params.playerId?.trim();
    if (!playerId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PLAYER_ID',
        message: 'Player ID is required',
        data: null,
      });
    }

    return res.status(503).json({
      ok: false,
      code: SLEEPER_USAGE_UNAVAILABLE_CODE,
      message: 'Verified player usage data is unavailable for this endpoint.',
      data: null,
      provenance: {
        state: 'unavailable',
        syntheticFallbackAllowed: false,
      },
    });
  },
);
