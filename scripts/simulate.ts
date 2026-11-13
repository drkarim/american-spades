// Plays full games of the current bot against the original bot and prints
// how each fared.  Usage: npm run sim -- [games] [seed] [A] [B]
// where A and B are "new", "old", or "new:key=value,..." to override a tunable
// from src/bot/bot.ts (default: new old).
import type { Card, GameState, Seat } from '../src/types.ts';
import {
  SEATS, TEAM_SEATS, applyRoundScores, createDeck, getNextSeat, getTeamName, isGameOver,
  legalCards, resolveTrick, shuffle, type TeamName,
} from '../src/rules.ts';
import { TUNING, calculateBotBid, chooseBotCard } from '../src/bot/bot.ts';
import { legacyBid, legacyCard } from './legacyBot.ts';

interface Bot {
  bid: (gs: GameState, seat: Seat) => number;
  card: (gs: GameState, seat: Seat) => Card;
}
const DEFAULT_TUNING = { ...TUNING };
/** "old", "new", or "new:key=value,key=value" to try different tunables. */
const makeBot = (spec: string): Bot => {
  if (spec === 'old') return { bid: (gs, seat) => legacyBid(gs.hands[seat]), card: legacyCard };
  const overrides: Record<string, number> = {};
  for (const pair of (spec.split(':')[1] || '').split(',').filter(Boolean)) {
    const [key, value] = pair.split('=');
    if (!(key in DEFAULT_TUNING)) throw new Error(`Unknown tunable ${key}`);
    overrides[key] = Number(value);
  }
  const apply = () => Object.assign(TUNING, DEFAULT_TUNING, overrides);
  return {
    bid: (gs, seat) => { apply(); return calculateBotBid(gs, seat); },
    card: (gs, seat) => { apply(); return chooseBotCard(gs, seat); },
  };
};

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const newStats = () => ({
  wins: 0, rounds: 0, points: 0, contracts: 0, sets: 0, nils: 0, nilsMade: 0, bags: 0, bidTotal: 0, bagPenalties: 0,
});
type Stats = ReturnType<typeof newStats>;

const playGame = (bots: Record<TeamName, Bot>, stats: Record<TeamName, Stats>, random: () => number): TeamName | null => {
  const gs: GameState = {
    roomCode: 'SIM', players: [], adminId: '', status: 'BIDDING', dealer: 'NORTH', turn: 'NORTH',
    leadsWith: null, spadesBroken: false,
    hands: { NORTH: [], EAST: [], SOUTH: [], WEST: [] },
    bids: { NORTH: null, EAST: null, SOUTH: null, WEST: null },
    tricksWon: { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 },
    currentTrick: [], lastTrick: null, trickHistory: [],
    scores: { NS: { points: 0, bags: 0 }, EW: { points: 0, bags: 0 } },
    roundNumber: 0, roundHistory: [],
  };

  for (let round = 0; round < 60 && !isGameOver(gs.scores); round++) {
    const deck = shuffle(createDeck(), random);
    SEATS.forEach((s, i) => { gs.hands[s] = deck.slice(i * 13, i * 13 + 13); });
    gs.bids = { NORTH: null, EAST: null, SOUTH: null, WEST: null };
    gs.tricksWon = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
    gs.trickHistory = [];
    gs.currentTrick = [];
    gs.leadsWith = null;
    gs.spadesBroken = false;

    let seat = getNextSeat(gs.dealer);
    for (let i = 0; i < 4; i++) {
      gs.bids[seat] = bots[getTeamName(seat)].bid(gs, seat);
      seat = getNextSeat(seat);
    }

    seat = getNextSeat(gs.dealer);
    for (let t = 0; t < 13; t++) {
      for (let i = 0; i < 4; i++) {
        gs.turn = seat;
        const card = bots[getTeamName(seat)].card(gs, seat);
        const legal = legalCards(gs.hands[seat], gs.leadsWith, gs.spadesBroken);
        if (!legal.some(c => c.suit === card.suit && c.rank === card.rank)) {
          throw new Error(`Illegal card ${card.rank} ${card.suit} by ${seat}`);
        }
        const hand = gs.hands[seat];
        hand.splice(hand.findIndex(c => c.suit === card.suit && c.rank === card.rank), 1);
        gs.currentTrick.push({ seat, card });
        if (!gs.leadsWith) gs.leadsWith = card.suit;
        if (card.suit === 'SPADES') gs.spadesBroken = true;
        seat = getNextSeat(seat);
      }
      const winner = resolveTrick(gs.currentTrick);
      gs.tricksWon[winner]++;
      gs.trickHistory.push(gs.currentTrick);
      gs.currentTrick = [];
      gs.leadsWith = null;
      seat = winner;
    }

    for (const team of ['NS', 'EW'] as const) {
      const st = stats[team];
      const before = { ...gs.scores[team] };
      let bid = 0;
      let won = 0;
      for (const s of TEAM_SEATS[team]) {
        if (gs.bids[s] === 0) {
          st.nils++;
          if (gs.tricksWon[s] === 0) st.nilsMade++;
        } else { bid += gs.bids[s]!; won += gs.tricksWon[s]; }
      }
      if (bid > 0) {
        st.contracts++;
        st.bidTotal += bid;
        if (won < bid) st.sets++; else st.bags += won - bid;
      }
      st.rounds++;
      (st as any)._before = before;
    }
    applyRoundScores(gs.bids, gs.tricksWon, gs.scores);
    for (const team of ['NS', 'EW'] as const) {
      const st = stats[team];
      const before = (st as any)._before;
      st.points += gs.scores[team].points - before.points;
      if (gs.scores[team].bags < before.bags) st.bagPenalties++;
    }
    gs.dealer = getNextSeat(gs.dealer);
  }

  const { NS, EW } = gs.scores;
  if (NS.points === EW.points) return null;
  // A team that crashed below -200 loses; otherwise the higher score wins.
  return NS.points > EW.points ? 'NS' : 'EW';
};

const games = Number(process.argv[2]) || 2000;
const seed = Number(process.argv[3]) || 1;
const nameA = process.argv[4] || 'new';
const nameB = process.argv[5] || 'old';
const random = mulberry32(seed);
const botA = makeBot(nameA);
const botB = makeBot(nameB);
const totals = { A: newStats(), B: newStats() };

for (let g = 0; g < games; g++) {
  const aIsNS = g % 2 === 0; // alternate seats so neither side always deals first
  const bots = { NS: aIsNS ? botA : botB, EW: aIsNS ? botB : botA };
  const stats = { NS: aIsNS ? totals.A : totals.B, EW: aIsNS ? totals.B : totals.A };
  const winner = playGame(bots, stats, random);
  if (winner) stats[winner].wins++;
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');
const row = (label: string, f: (s: Stats) => string) =>
  console.log(label.padEnd(26) + f(totals.A).padStart(10) + f(totals.B).padStart(10));
console.log(`${games} games, seed ${seed}`);
console.log(`A = ${nameA}, B = ${nameB}`);
console.log(''.padEnd(26) + 'A'.padStart(10) + 'B'.padStart(10));
row('Games won', s => pct(s.wins, games));
row('Points per round', s => (s.points / s.rounds).toFixed(1));
row('Average team bid', s => (s.bidTotal / s.contracts).toFixed(2));
row('Bids set', s => pct(s.sets, s.contracts));
row('Bags per round', s => (s.bags / s.rounds).toFixed(2));
row('Bag penalties per game', s => (s.bagPenalties / games).toFixed(2));
row('Nil bids per round', s => (s.nils / s.rounds).toFixed(2));
row('Nil bids made', s => pct(s.nilsMade, s.nils));
