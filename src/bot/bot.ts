// Spades bot: bidding and card play.
//
// The bot only uses what a human in the same seat could know: its own hand,
// the bids, the score, and the cards played so far this round.
import type { Card, GameState, Seat, Suit } from '../types.ts';
import {
  SEATS, SUITS, TEAM_SEATS, beatsCard, getNextSeat, getPartnerSeat, getRankValue,
  getTeamName, legalCards, winningPlay, type Play,
} from '../rules.ts';

// --- TUNABLES ---
export const TUNING = {
  /** Nil is bid when the estimated risk of taking a trick is below this. */
  nilMaxRisk: 0.5,
  /** Subtracted from the trick estimate before rounding (higher = more cautious bids). */
  bidShade: 0.15,
  /** Extra tricks expected when covering a Nil partner (high cards get played early). */
  nilPartnerBonus: 0.3,
  /** Try to set the opponents if it costs at most this many extra tricks (bags). */
  setMaxExtraTricks: 2,
};

const val = (c: Card) => getRankValue(c.rank);
const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;
const bySuit = (cards: Card[]): Record<Suit, Card[]> => {
  const out: Record<Suit, Card[]> = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  for (const c of cards) out[c.suit].push(c);
  return out;
};
const lowest = (cards: Card[]) => cards.reduce((a, b) => (val(b) < val(a) ? b : a));
const highest = (cards: Card[]) => cards.reduce((a, b) => (val(b) > val(a) ? b : a));
/** Card with the highest score; ties go to the earlier card. */
const maxBy = (cards: Card[], score: (c: Card) => number): Card => {
  let best = cards[0];
  let bestScore = score(best);
  for (let i = 1; i < cards.length; i++) {
    const s = score(cards[i]);
    if (s > bestScore) { best = cards[i]; bestScore = s; }
  }
  return best;
};

// ---------------------------------------------------------------------------
// BIDDING
// ---------------------------------------------------------------------------

/** Expected number of tricks this hand takes when played to win. */
export const estimateTricks = (hand: Card[]): number => {
  const suits = bySuit(hand);
  let total = 0;

  // Spades: high cards win by rank, the 4th and later spades win by length.
  const spades = [...suits.SPADES].sort((a, b) => val(b) - val(a));
  const n = spades.length;
  let spareSpades = 0; // low spades whose main value is ruffing
  spades.forEach((c, i) => {
    let p: number;
    if (i >= 3) {
      p = i === 3 ? 0.6 : 0.9;
    } else {
      const higherOut = 14 - val(c) - i; // higher spades held by other players
      const guards = n - 1 - i;          // lower spades to duck with
      if (higherOut <= 0) p = 1;
      else if (higherOut === 1) p = guards >= 1 ? 0.75 : 0.35;
      else if (higherOut === 2) p = guards >= 2 ? 0.5 : 0.15;
      else p = i === 2 ? 0.1 : 0;
    }
    if (p < 0.5) spareSpades++;
    total += p;
  });

  // Side suits: aces, guarded kings, supported queens. Long suits get ruffed.
  const ruffChances: number[] = [];
  for (const suit of SUITS) {
    if (suit === 'SPADES') continue;
    const cards = suits[suit];
    const len = cards.length;
    const hasA = cards.some(c => c.rank === 'A');
    const hasK = cards.some(c => c.rank === 'K');
    const hasQ = cards.some(c => c.rank === 'Q');
    if (hasA) total += len <= 5 ? 0.95 : len === 6 ? 0.75 : 0.5;
    if (hasK) {
      if (len === 1) total += 0.15;
      else total += Math.max(0.1, (hasA ? 0.85 : 0.6) - (len >= 6 ? 0.4 : len === 5 ? 0.25 : 0));
    }
    if (hasQ && len >= 3 && len <= 4) {
      total += hasA && hasK ? 0.5 : hasA || hasK ? 0.35 : 0.15;
    }
    if (len === 0) ruffChances.push(0.9, 0.6);
    else if (len === 1) ruffChances.push(0.65, 0.3);
    else if (len === 2) ruffChances.push(0.3);
  }
  ruffChances.sort((a, b) => b - a);
  for (let i = 0; i < Math.min(spareSpades, ruffChances.length); i++) total += ruffChances[i];

  return total;
};

/** Rough chance of being forced to take a trick when bidding Nil. Infinity = never bid Nil. */
export const nilRisk = (hand: Card[]): number => {
  const suits = bySuit(hand);
  const spades = suits.SPADES;
  if (spades.some(c => val(c) >= 12)) return Infinity; // A/K/Q of spades almost always wins
  if (spades.length >= 5) return Infinity;

  let risk = 0;
  for (const c of spades) {
    const v = val(c);
    risk += v >= 11 ? 0.4 : v === 10 ? 0.25 : v === 9 ? 0.15 : v >= 7 ? 0.07 : 0.02;
  }
  if (spades.length === 4) risk += 0.2;

  for (const suit of SUITS) {
    if (suit === 'SPADES') continue;
    const cards = [...suits[suit]].sort((a, b) => val(a) - val(b));
    // The lowest cards of a suit must be low enough to duck the first rounds.
    cards.forEach((c, i) => {
      const limit = i < 3 ? 5 + 3 * i : 13;
      const excess = val(c) - limit;
      if (excess > 0) risk += 0.06 * excess;
    });
    if (cards.length === 0) risk -= 0.05; // a void lets us throw away danger cards
  }
  return risk;
};

export const calculateBotBid = (gameState: GameState, seat: Seat): number => {
  const hand = gameState.hands[seat];
  const bids = gameState.bids;
  const partnerBid = bids[getPartnerSeat(seat)];
  const team = getTeamName(seat);
  const myPoints = gameState.scores[team].points;
  const oppPoints = gameState.scores[team === 'NS' ? 'EW' : 'NS'].points;

  // --- Nil ---
  if (partnerBid !== 0) {
    let limit = TUNING.nilMaxRisk;
    if (partnerBid !== null && partnerBid >= 4) limit += 0.08; // strong partner covers well
    if (oppPoints - myPoints >= 150) limit += 0.1;             // behind: gamble more
    if (myPoints - oppPoints >= 150) limit -= 0.1;             // ahead: protect the lead
    if (nilRisk(hand) < limit) return 0;
  }

  // --- Normal bid ---
  let estimate = estimateTricks(hand);
  if (partnerBid === 0) estimate += TUNING.nilPartnerBonus;
  if (gameState.scores[team].bags >= 7) estimate += 0.3; // close to a bag penalty: bid up

  let bid = Math.round(estimate - TUNING.bidShade);

  // Last to bid: use the table total.
  const others = SEATS.filter(s => s !== seat).map(s => bids[s]);
  if (others.every(b => b !== null)) {
    const othersTotal = others.reduce((sum: number, b) => sum + (b || 0), 0);
    if (othersTotal + bid > 13 && bid > 1) bid -= 1;                           // someone must go set
    else if (othersTotal + bid <= 10) bid = Math.round(estimate + 0.25);      // tricks to spare
  }

  return Math.max(1, Math.min(13, bid));
};

// ---------------------------------------------------------------------------
// CARD PLAY
// ---------------------------------------------------------------------------

type Mode = 'TAKE' | 'DUCK';

interface Ctx {
  seat: Seat;
  partner: Seat;
  opps: Seat[];
  hand: Card[];
  legal: Card[];
  mySuits: Record<Suit, Card[]>;
  trick: Play[];
  /** Rank values not yet seen, per suit, held by the other three players. */
  unseen: Record<Suit, number[]>;
  /** Seats known to be out of a suit (they failed to follow it). */
  voids: Record<Seat, Record<Suit, boolean>>;
  mode: Mode;
  /** Tricks my team still needs for its bid. */
  need: number;
  myNil: boolean;
  partnerNil: boolean;
  nilOpp: Seat | undefined;
  spadesBroken: boolean;
}

const buildCtx = (gs: GameState, seat: Seat): Ctx => {
  const hand = gs.hands[seat];
  const partner = getPartnerSeat(seat);
  const opps = SEATS.filter(s => s !== seat && s !== partner);
  const trick = gs.currentTrick.length >= 4 ? [] : gs.currentTrick;
  const led = trick.length > 0 ? trick[0].card.suit : null;

  // Card memory
  const unseen: Record<Suit, number[]> = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  const voids = {} as Record<Seat, Record<Suit, boolean>>;
  for (const s of SEATS) voids[s] = { SPADES: false, HEARTS: false, DIAMONDS: false, CLUBS: false };
  const seen = new Set<string>();
  for (const c of hand) seen.add(c.suit + c.rank);
  for (const t of [...(gs.trickHistory || []), trick]) {
    if (t.length === 0) continue;
    const ledSuit = t[0].card.suit;
    for (const p of t) {
      seen.add(p.card.suit + p.card.rank);
      if (p.card.suit !== ledSuit) voids[p.seat][ledSuit] = true;
    }
  }
  for (const suit of SUITS) {
    for (let v = 2; v <= 14; v++) {
      const rank = v <= 10 ? String(v) : ['J', 'Q', 'K', 'A'][v - 11];
      if (!seen.has(suit + rank)) unseen[suit].push(v);
    }
  }

  // Contracts. A Nil bidder's tricks never count toward the partner's bid.
  const contract = (seats: Seat[]) => {
    let bid = 0;
    let won = 0;
    for (const s of seats) {
      if ((gs.bids[s] || 0) > 0) { bid += gs.bids[s]!; won += gs.tricksWon[s]; }
    }
    return { bid, need: bid - won };
  };
  const team = getTeamName(seat);
  const mine = contract(TEAM_SEATS[team]);
  const theirs = contract(opps);
  const tricksLeft = hand.length;
  const iBustedNil = gs.bids[seat] === 0 && gs.tricksWon[seat] > 0;

  // To set the opponents we must win all but (oppNeed - 1) of the remaining tricks.
  const extraToSet = tricksLeft - theirs.need + 1;
  const bags = gs.scores[team].bags;
  const worthSetting = theirs.need > 0 && extraToSet >= 1 &&
    (extraToSet <= TUNING.setMaxExtraTricks || (extraToSet <= TUNING.setMaxExtraTricks + 1 && theirs.bid >= 5)) &&
    (bags + extraToSet < 10 || theirs.bid >= 7);

  let mode: Mode;
  if (mine.need > 0 && mine.need <= tricksLeft && !iBustedNil) mode = 'TAKE';
  else if (worthSetting) mode = 'TAKE';
  else mode = 'DUCK';

  return {
    seat, partner, opps, hand, trick, unseen, voids, mode,
    legal: legalCards(hand, led, gs.spadesBroken),
    mySuits: bySuit(hand),
    need: mine.need,
    myNil: gs.bids[seat] === 0 && gs.tricksWon[seat] === 0,
    partnerNil: gs.bids[partner] === 0 && gs.tricksWon[partner] === 0,
    nilOpp: opps.find(s => gs.bids[s] === 0 && gs.tricksWon[s] === 0),
    spadesBroken: gs.spadesBroken,
  };
};

const higherUnseen = (ctx: Ctx, c: Card) => ctx.unseen[c.suit].filter(v => v > val(c)).length;
const lowerUnseen = (ctx: Ctx, c: Card) => ctx.unseen[c.suit].filter(v => v < val(c)).length;
/** No one else holds a higher card of this suit. */
const isBoss = (ctx: Ctx, c: Card) => higherUnseen(ctx, c) === 0;
/** Could one of `seats` trump a lead of `suit`? */
const mayRuff = (ctx: Ctx, suit: Suit, seats: Seat[]) =>
  suit !== 'SPADES' && ctx.unseen.SPADES.length > 0 &&
  seats.some(s => ctx.voids[s][suit] && !ctx.voids[s].SPADES);
/** Cheapest card of mine that is worth exactly as much as `c` (touching cards). */
const cheapestEquivalent = (ctx: Ctx, c: Card): Card => {
  const lower = ctx.mySuits[c.suit].filter(x => val(x) < val(c)).sort((a, b) => val(b) - val(a));
  let current = c;
  for (const x of lower) {
    if (ctx.unseen[c.suit].some(v => v > val(x) && v < val(current))) break;
    current = x;
  }
  return current;
};
const seatsAfterMe = (ctx: Ctx): Seat[] => {
  const out: Seat[] = [];
  let s = ctx.seat;
  for (let i = ctx.trick.length + 1; i < 4; i++) { s = getNextSeat(s); out.push(s); }
  return out;
};

// --- Leading ---

/** Chance that leading this card wins the trick (rough). */
const leadWinRisk = (ctx: Ctx, c: Card): number => {
  const higher = higherUnseen(ctx, c);
  const lower = lowerUnseen(ctx, c);
  if (higher === 0) return c.suit !== 'SPADES' && ctx.unseen.SPADES.length > 0 && lower === 0 ? 0.8 : 1;
  if (lower === 0) return 0;
  return lower / (lower + higher);
};

/** Lead the card least likely to win; among equally safe cards, shed the biggest. */
const leadSafest = (ctx: Ctx): Card =>
  maxBy(ctx.legal, c => -leadWinRisk(ctx, c) * 100 + val(c) / 100);

/** Partner bid Nil: lead cards partner can get under, or suits partner is out of. */
const leadCover = (ctx: Ctx): Card =>
  maxBy(ctx.legal, c => {
    if (ctx.voids[ctx.partner][c.suit]) {
      // Partner discards freely here. Win it if we need tricks, otherwise keep high cards.
      return 100 + (ctx.mode === 'TAKE' && isBoss(ctx, c) ? 20 : -val(c) / 100);
    }
    return -higherUnseen(ctx, c) + val(c) / 100;
  });

/** An opponent bid Nil: lead low so they may be forced to win. */
const leadNilAttack = (ctx: Ctx): Card | null => {
  const nil = ctx.nilOpp!;
  const cover = getPartnerSeat(nil);
  const candidates = ctx.legal.filter(c =>
    !ctx.voids[nil][c.suit] &&
    !mayRuff(ctx, c.suit, [cover]) &&
    higherUnseen(ctx, c) > 0 &&
    (lowerUnseen(ctx, c) <= 2 || val(c) <= (c.suit === 'SPADES' ? 5 : 7)));
  if (candidates.length === 0) return null;
  return maxBy(candidates, c => -lowerUnseen(ctx, c) * 10 - val(c) / 100);
};

/** Lead to win tricks: cash winners, draw trumps, set up ruffs. */
const leadTake = (ctx: Ctx): Card => {
  const spadesOut = ctx.unseen.SPADES.length;
  const mySpades = ctx.mySuits.SPADES.length;
  const partnerCanRuff = (suit: Suit) =>
    spadesOut > 0 && ctx.voids[ctx.partner][suit] && !ctx.voids[ctx.partner].SPADES;

  return maxBy(ctx.legal, c => {
    const suitCards = ctx.mySuits[c.suit];
    const len = suitCards.length;
    const boss = isBoss(ctx, c);
    const tie = val(c) / 100;

    if (c.suit === 'SPADES') {
      if (boss) {
        // Draw trumps when we hold length, or when nothing is left to be drawn from partner.
        return (mySpades >= 4 || mySpades >= spadesOut ? 45 : 8) + tie;
      }
      if (!sameCard(c, lowest(suitCards))) return -50;
      return mySpades >= 5 ? 9 : 2;
    }

    const ruffed = mayRuff(ctx, c.suit, ctx.opps);
    if (boss) {
      let s = 50;
      if (ruffed) s -= 40;
      else if (ctx.unseen[c.suit].length < 3 && spadesOut > 0) s -= 15; // someone is probably out
      return s + tie;
    }

    if (!sameCard(c, lowest(suitCards))) return -50; // only ever lead low from a suit without the boss
    let s = 10 + len;
    // Leading away from an unsupported honour gives the trick away.
    if (suitCards.some(x => val(x) >= 11 && !isBoss(ctx, x))) s -= 6;
    if (ruffed) s -= 8;
    if (partnerCanRuff(c.suit)) s += 25;
    // Short suit: empty it so we can trump later.
    if (len <= 2 && mySpades > 0 && spadesOut > 0 && ctx.unseen[c.suit].length >= 4) s += 12;
    return s;
  });
};

const chooseLead = (ctx: Ctx): Card => {
  if (ctx.myNil) return leadSafest(ctx);
  if (ctx.partnerNil) return leadCover(ctx);
  if (ctx.nilOpp && (ctx.need <= 0 || ctx.hand.length - ctx.need >= 2)) {
    const attack = leadNilAttack(ctx);
    if (attack) return attack;
  }
  return ctx.mode === 'DUCK' ? leadSafest(ctx) : leadTake(ctx);
};

// --- Following ---

/** Discard while trying to win tricks: keep spades and winners, shorten short suits. */
const discardKeepingWinners = (ctx: Ctx, cards: Card[]): Card =>
  maxBy(cards, c => {
    if (c.suit === 'SPADES') return -1000 - val(c);
    if (isBoss(ctx, c)) return -500 - val(c);
    return -val(c) - ctx.mySuits[c.suit].length;
  });

/** Discard while trying to avoid tricks: throw winners and high cards. */
const discardDangerous = (ctx: Ctx, cards: Card[], nil: boolean): Card =>
  maxBy(cards, c => {
    if (c.suit === 'SPADES') return val(c) >= 8 || !nil ? 25 + val(c) : val(c) - 5;
    const short = ctx.mySuits[c.suit].length <= 2 ? 2 : 0;
    return val(c) + short + (!nil && isBoss(ctx, c) ? 10 : 0);
  });

const chooseFollow = (ctx: Ctx): Card => {
  const { trick, legal, partner } = ctx;
  const led = trick[0].card.suit;
  const best = winningPlay(trick);
  const isLast = trick.length === 3;
  const canFollow = legal[0].suit === led;
  const winners = legal.filter(c => beatsCard(c, best.card));
  const losers = legal.filter(c => !beatsCard(c, best.card));
  const after = seatsAfterMe(ctx);

  // --- I bid Nil: stay under the winning card, shedding the biggest safe card ---
  if (ctx.myNil) {
    if (losers.length > 0) return canFollow ? highest(losers) : discardDangerous(ctx, losers, true);
    return isLast ? highest(legal) : lowest(legal);
  }

  // When covering a Nil partner we keep our high cards for later tricks.
  const keepHighCards = ctx.partnerNil;

  // --- Partner bid Nil: make sure partner does not win this trick ---
  if (ctx.partnerNil) {
    const partnerPlayed = trick.some(p => p.seat === partner);
    if (partnerPlayed) {
      if (best.seat === partner && winners.length > 0) return lowest(winners);
    } else if (!ctx.voids[partner][led]) {
      const strong = (best.card.suit === 'SPADES' && led !== 'SPADES') ||
        val(best.card) >= 12 || isBoss(ctx, best.card);
      if (!strong && winners.length > 0) {
        return canFollow ? cheapestEquivalent(ctx, highest(winners)) : lowest(winners);
      }
    }
  }

  // --- Opponent bid Nil: let them win, never rescue them ---
  if (ctx.nilOpp) {
    const nilPlayed = trick.some(p => p.seat === ctx.nilOpp);
    if (nilPlayed && best.seat === ctx.nilOpp && losers.length > 0) {
      return canFollow ? highest(losers) : discardKeepingWinners(ctx, losers);
    }
    if (!nilPlayed && ctx.mode === 'DUCK' && !ctx.partnerNil) {
      return canFollow ? lowest(legal) : discardKeepingWinners(ctx, losers.length > 0 ? losers : legal);
    }
  }

  // --- Avoiding tricks (bid made, or busted Nil) ---
  if (ctx.mode === 'DUCK') {
    if (losers.length > 0) {
      if (keepHighCards) return canFollow ? lowest(losers) : discardKeepingWinners(ctx, losers);
      return canFollow ? highest(losers) : discardDangerous(ctx, losers, false);
    }
    // Every card wins for now. If we are last we take it with our biggest card.
    return isLast && !keepHighCards ? highest(legal) : lowest(legal);
  }

  // --- Taking tricks ---
  const giveUp = () => (canFollow ? lowest(legal) : discardKeepingWinners(ctx, losers.length > 0 ? losers : legal));

  if (best.seat === partner) return giveUp(); // never overtake partner
  if (winners.length === 0) return giveUp();
  if (isLast) return lowest(winners);         // win as cheaply as possible

  if (!canFollow) return lowest(winners);     // trump in

  const top = highest(winners);
  if (isBoss(ctx, top)) return cheapestEquivalent(ctx, top);
  // Second hand low: partner still gets a chance. Third hand high.
  if (after.includes(partner)) return lowest(legal);
  return cheapestEquivalent(ctx, top);
};

export const chooseBotCard = (gameState: GameState, seat: Seat): Card => {
  const ctx = buildCtx(gameState, seat);
  if (ctx.legal.length === 1) return ctx.legal[0];
  const card = ctx.trick.length === 0 ? chooseLead(ctx) : chooseFollow(ctx);
  return ctx.legal.find(c => sameCard(c, card)) || ctx.legal[0];
};
