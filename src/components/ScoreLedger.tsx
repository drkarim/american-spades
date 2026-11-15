import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import type { Player, RoundRecord, Seat, TeamRoundResult } from '../types';

type TeamName = 'NS' | 'EW';
const TEAM_SEATS: Record<TeamName, Seat[]> = { NS: ['NORTH', 'SOUTH'], EW: ['EAST', 'WEST'] };
const TEAM_LABEL: Record<TeamName, string> = { NS: 'Team 1', EW: 'Team 2' };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const changeColor = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white/60');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const nameOf = (players: Player[], seat: Seat) =>
  players.find(p => p.seat === seat)?.name || seat.charAt(0) + seat.slice(1).toLowerCase();

interface Line {
  label: string;
  points?: number;
  bags?: number;
}

/** The individual items that make up a team's score change for one round. */
const breakdownLines = (r: TeamRoundResult, players: Player[]): Line[] => {
  const lines: Line[] = [];
  if (r.made !== null) {
    lines.push({
      label: r.made ? `Bid ${r.bid}, won ${r.won} — made` : `Bid ${r.bid}, won ${r.won} — set`,
      points: r.bidPoints,
    });
    if (r.overtricks > 0) lines.push({ label: plural(r.overtricks, 'overtrick'), bags: r.overtricks });
  }
  for (const nil of r.nils) {
    const who = nameOf(players, nil.seat);
    lines.push(nil.made
      ? { label: `${who}'s Nil made`, points: 100 }
      : { label: `${who}'s Nil failed (${plural(nil.tricks, 'trick')})`, points: -100, bags: nil.tricks });
  }
  if (r.bagPenalty < 0) {
    lines.push({ label: `Bag penalty (${-r.bagPenalty / 100 * 10} bags)`, points: r.bagPenalty });
  }
  return lines;
};

/** How a team's score changed in one round, line by line, ending in the new total. */
export function RoundBreakdown({ result, players }: { result: TeamRoundResult; players: Player[] }) {
  const lines = breakdownLines(result, players);
  return (
    <div className="text-xs leading-snug">
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="text-white/75">{line.label}</span>
            <span className="flex gap-2 shrink-0 tabular-nums font-semibold">
              {line.points !== undefined && <span className={changeColor(line.points)}>{signed(line.points)}</span>}
              {line.bags ? <span className="text-amber-300">+{plural(line.bags, 'bag')}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-baseline gap-3 mt-2 pt-2 border-t border-white/10">
        <span className="text-white/90 font-semibold">Round total</span>
        <span className={`text-base font-bold tabular-nums ${changeColor(result.change)}`}>{signed(result.change)}</span>
      </div>
    </div>
  );
}

/** Small column for one team in a ledger row. */
function LedgerCell({ r }: { r: TeamRoundResult }) {
  const bidText = r.made === null ? 'Nil only' : `Bid ${r.bid} · Won ${r.won}`;
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-white/60 truncate">
        {bidText}
        {r.nils.length > 0 && r.made !== null && ` · ${r.nils.length} Nil`}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-sm font-bold tabular-nums ${changeColor(r.change)}`}>{signed(r.change)}</span>
        <span className="text-white/40 text-xs">→</span>
        <span className="text-base font-serif italic text-white tabular-nums">{r.points}</span>
      </div>
      <div className="text-[11px] text-white/50 tabular-nums">
        Bags {r.bags}
        {r.bagsGained > 0 && <span className="text-amber-300"> (+{r.bagsGained})</span>}
        {r.bagPenalty < 0 && <span className="text-red-400"> · penalty</span>}
      </div>
    </div>
  );
}

function LedgerRow({ record, players, defaultOpen }: { record: RoundRecord; players: Player[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-widest text-gold">Round {record.round}</span>
          <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LedgerCell r={record.teams.NS} />
          <LedgerCell r={record.teams.EW} />
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-3 pb-3">
          {(['NS', 'EW'] as const).map(team => (
            <div key={team} className="bg-black/30 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2">{TEAM_LABEL[team]}</div>
              <ul className="space-y-1 mb-3 text-xs">
                {TEAM_SEATS[team].map(seat => (
                  <li key={seat} className="flex justify-between gap-2">
                    <span className="text-white/80 truncate">{nameOf(players, seat)}</span>
                    <span className="text-white/60 tabular-nums shrink-0">
                      {record.bids[seat] === 0 ? 'Nil' : `Bid ${record.bids[seat]}`} · Won {record.tricksWon[seat]}
                    </span>
                  </li>
                ))}
              </ul>
              <RoundBreakdown result={record.teams[team]} players={players} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Full-screen list of every finished round: what each team bid, won, scored and bagged. */
export function ScoreHistory({
  history, players, teamNames, onClose,
}: {
  history: RoundRecord[];
  players: Player[];
  teamNames: Record<TeamName, string>;
  onClose: () => void;
}) {
  const listEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Open at the most recent round.
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-[2500] bg-black/90 backdrop-blur flex items-center justify-center p-3 sm:p-6"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#0a1a14] w-full max-w-lg max-h-full flex flex-col rounded-3xl border-2 border-gold/30 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-2xl font-serif italic text-gold">Score History</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors" aria-label="Close score history">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 pb-2 border-b border-white/10">
          {(['NS', 'EW'] as const).map(team => (
            <div key={team} className="min-w-0">
              <div className={`text-[11px] font-bold uppercase tracking-widest ${team === 'NS' ? 'text-gold' : 'text-white/60'}`}>{TEAM_LABEL[team]}</div>
              <div className="text-xs text-white/80 truncate">{teamNames[team]}</div>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto px-3 py-3">
          {history.length === 0 ? (
            <p className="text-center text-sm text-white/60 py-10">No rounds finished yet. Scores appear here after each round.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((record, i) => (
                <li key={record.round} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <LedgerRow record={record} players={players} defaultOpen={i === history.length - 1} />
                </li>
              ))}
            </ul>
          )}
          <div ref={listEnd} />
        </div>

        <div className="px-5 pb-5 pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white font-bold uppercase tracking-widest text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
