import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BreakoutDraftTag } from '@/lib/breakoutDraftTags';
import './BreakoutSignalBadge.css';

function formatGeneratedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function probabilityTargetLabel(target: string): string {
  if (target === 'ros_tier_jump') return 'move into a better WR PPG tier in 2026';
  if (target === 'top_12_next_4w') return 'finish top-12 over the next four weeks';
  if (target === 'top_24_next_4w') return 'finish top-24 over the next four weeks';
  return target.replaceAll('_', ' ');
}

export function BreakoutSignalBadge({ tag }: { tag: BreakoutDraftTag | null }) {
  if (!tag) return null;

  const generatedAt = formatGeneratedAt(tag.generatedAt);
  const provisional = tag.evidenceStatus === 'provisional_research_only';
  const heading = provisional ? 'Provisional tier-jump evidence' : 'Promoted breakout evidence';
  const statusCopy = provisional
    ? 'Draft-night research lane. v1.4 passed the observed accuracy, lift, uncertainty, calibration and challenger checks, but had 21 unseen positive events versus the preregistered 30-event certification minimum.'
    : 'Certified promoted evidence from the external breakout model.';

  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${tag.displayLabel} ${provisional ? 'provisional research' : 'promoted model'} evidence for ${tag.playerName}`}
            data-breakout-signal-season={tag.targetSeason}
            data-breakout-signal-player-id={tag.playerId ?? undefined}
            data-breakout-evidence-status={tag.evidenceStatus ?? 'certified_promoted'}
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
              provisional
                ? 'border-dashed border-amber-300/50 bg-amber-400/10 text-amber-100'
                : 'border-amber-400/35 bg-amber-400/10 text-amber-200'
            }`}
          >
            {tag.displayLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-80 space-y-1.5 text-xs leading-relaxed">
          <strong className="block">{heading}</strong>
          <span className="block">
            {tag.probability.percent}% modeled probability to {probabilityTargetLabel(tag.probability.target)}.
          </span>
          {tag.breakoutContext ? <span className="block">{tag.breakoutContext}</span> : null}
          <span className="block text-muted-foreground">{statusCopy}</span>
          <span className="block text-muted-foreground">
            {tag.candidateRank != null ? `Signal rank ${tag.candidateRank}` : 'Signal rank unavailable'}
            {tag.finalSignalScore != null ? ` · score ${tag.finalSignalScore}` : ''}
          </span>
          {tag.modelVersion ? <span className="block text-muted-foreground">Model: {tag.modelVersion}</span> : null}
          {generatedAt ? <span className="block text-muted-foreground">Generated: {generatedAt}</span> : null}
          <span className="block text-muted-foreground">Evidence only; use it as one input to draft decisions, not as an automatic pick instruction.</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
