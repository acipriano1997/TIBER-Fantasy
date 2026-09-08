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

export function BreakoutSignalBadge({ tag }: { tag: BreakoutDraftTag | null }) {
  if (!tag) return null;

  const generatedAt = formatGeneratedAt(tag.generatedAt);

  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${tag.label} promoted model evidence for ${tag.playerName}`}
            data-breakout-signal-season={tag.targetSeason}
            data-breakout-signal-player-id={tag.playerId ?? undefined}
            className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-200"
          >
            {tag.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 space-y-1.5 text-xs leading-relaxed">
          <strong className="block">Promoted breakout evidence</strong>
          {tag.breakoutContext ? <span className="block">{tag.breakoutContext}</span> : null}
          <span className="block text-muted-foreground">
            {tag.candidateRank != null ? `Candidate rank ${tag.candidateRank}` : 'Candidate rank unavailable'}
            {tag.finalSignalScore != null ? ` · signal ${tag.finalSignalScore}` : ''}
          </span>
          {tag.modelVersion ? <span className="block text-muted-foreground">Model: {tag.modelVersion}</span> : null}
          {generatedAt ? <span className="block text-muted-foreground">Generated: {generatedAt}</span> : null}
          <span className="block text-muted-foreground">Evidence only; this badge is not a draft instruction.</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
