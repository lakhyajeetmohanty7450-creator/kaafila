import { Info } from 'lucide-react';

export default function DemoNoticeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-kaafila-border bg-kaafila-sand/70 px-4 py-3 text-xs text-kaafila-text/90">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-kaafila-accent" />
      <p className="leading-relaxed">
        <strong className="text-kaafila-text">Marketplace Demo Data Notice:</strong> Pre-populated touring outfits,
        expeditions, and sample rider profiles are clearly labelled <span className="font-mono">DEMO</span> until real
        touring organisations register and verify their profiles. Ratings only appear where genuine reviews exist.
      </p>
    </div>
  );
}

