import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDraftBustTag, type DraftBustTag } from '@/lib/draftBustTags';

function mechanismLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

export function DraftBustSignalBadge({ tag, playerName }: { tag: DraftBustTag | null; playerName: string }) {
  if (!tag) return null;
  const display = formatDraftBustTag(tag.probability.value);
  if (!display) return null;
  const primaryMechanism = tag.mechanisms[0] ?? null;

  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${display} promoted draft bust probability for ${playerName}`}
            data-draft-bust-season={tag.targetSeason}
            data-draft-bust-player-id={tag.playerId}
            className="inline-flex items-center rounded-full border border-red-400/40 bg-red-400/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-red-200"
          >
            {display}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-80 space-y-1.5 text-xs leading-relaxed">
          <strong className="block">Promoted preseason draft-bust evidence</strong>
          <span className="block">
            {tag.probability.percent}% calibrated probability of a material season-value failure relative to draft acquisition cost.
          </span>
          {primaryMechanism ? <span className="block">Primary pathway: {mechanismLabel(primaryMechanism)}.</span> : null}
          {tag.severityExpected != null ? <span className="block">Expected conditional loss: {tag.severityExpected}.</span> : null}
          <span className="block text-muted-foreground">Model: {tag.modelVersion}</span>
          <span className="block text-muted-foreground">Calibration: {tag.calibrationVersion} · Label: {tag.labelDefinitionVersion}</span>
          <span className="block text-muted-foreground">As of: {tag.asOf}</span>
          <span className="block text-muted-foreground">Evidence only. This probability does not apply an automatic ranking penalty.</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
