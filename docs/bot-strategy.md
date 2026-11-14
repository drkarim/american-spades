# Bot strategy

How the bots bid and play. The code is in [`src/bot/bot.ts`](../src/bot/bot.ts); the same bot plays as a partner and as an opponent.

## Ground rules

- **No peeking.** A bot uses only what a human in its seat could know: its own hand, the bids, the score, and the cards played so far this round.
- **Card memory.** From the completed tricks (`GameState.trickHistory`) and the current trick, the bot works out:
  - which cards are still unseen in each suit (not played, not in its hand);
  - which players are out of a suit, because they failed to follow it;
  - whether a card is the **boss**: no higher card of that suit is still unseen.
- **Scoring it plays to** (see [`src/rules.ts`](../src/rules.ts)): 10 points per trick bid, 1 bag per overtrick, minus 100 at 10 bags, Nil worth plus or minus 100, game to 500 or down to -200. A Nil bidder's tricks never count toward the partner's bid.

## Bidding

### Trick estimate

The bot adds up the expected tricks in its hand.

**Spades**, sorted from the top:

| Card | Value |
|---|---|
| No higher spade held by others (A, or K with the A, ...) | 1 |
| One higher spade out, with a lower spade to duck with | 0.75 |
| One higher spade out, unguarded | 0.35 |
| Two higher spades out, with two lower spades | 0.5 |
| Two higher spades out, fewer guards | 0.15 |
| Third spade when it is low | 0.1 |
| Fourth spade | 0.6 |
| Fifth and later spades | 0.9 each |

**Side suits:**

| Holding | Value |
|---|---|
| Ace | 0.95 (0.75 in a 6-card suit, 0.5 if longer) |
| King, singleton | 0.15 |
| King, guarded | 0.6, or 0.85 with the ace; less in 5+ card suits |
| Queen in a 3 or 4 card suit | 0.5 with A and K, 0.35 with one of them, 0.15 alone |

**Ruffs.** Short side suits only count when there are low spades to trump with. A void offers 0.9 then 0.6, a singleton 0.65 then 0.3, a doubleton 0.3. The best of these are counted, one per spare low spade.

### From estimate to bid

1. Add 0.3 if partner bid Nil (covering wins extra tricks).
2. Add 0.3 if the team has 7 or more bags (bid up to avoid the penalty).
3. Subtract 0.15 and round.
4. If last to bid:
   - table total would exceed 13: bid one less, since someone must fail;
   - table total would be 10 or less: round up more generously, since tricks are spare.
5. Minimum bid is 1.

### Nil

Never bid Nil when:

- holding the A, K or Q of spades;
- holding five or more spades;
- partner has already bid Nil.

Otherwise the bot scores the risk of being forced to win a trick:

- **Spades:** J adds 0.4, 10 adds 0.25, 9 adds 0.15, 7 or 8 adds 0.07, lower adds 0.02. Four spades adds 0.2.
- **Side suits:** the lowest card should be 5 or below, the second lowest 8 or below, the third lowest J or below. Each rank above those limits adds 0.06.
- **Void:** subtracts 0.05, because it gives a place to throw danger cards.

It bids Nil when the risk is under 0.5. That limit moves:

- up 0.08 when partner bid 4 or more (a strong hand covers well);
- up 0.1 when 150 or more points behind;
- down 0.1 when 150 or more points ahead.

## Card play

### Choosing a goal

Each time it plays, the bot picks one goal for its team.

- **Take tricks**: the team still needs tricks for its bid and can still reach it.
- **Set the opponents**: the team's bid is safe (or already lost), the opponents still need tricks, and winning enough to stop them costs at most 2 extra tricks, or 3 when they bid 5 or more. It is skipped if those extra tricks would trigger a bag penalty, unless the opponents bid 7 or more. This is played like "take tricks".
- **Avoid tricks**: everything else, including a bot whose own Nil has been busted.

Nil situations are handled first and override the goal. They apply only while the Nil is still alive; once a Nil bidder has taken a trick, everyone goes back to normal play.

### Leading

**Taking tricks.** Every legal lead is scored and the best one played:

- Cash a boss card in a side suit. Less attractive if few cards of that suit are left, and much less if an opponent is known to be out of it and can trump.
- Draw trumps by leading the boss spade when holding four or more spades, or at least as many as everyone else combined.
- Lead a suit partner is out of, so partner can trump.
- Lead low from a short suit (one or two cards) to empty it for trumping later.
- Otherwise lead low from the longest suit, avoiding suits with an unsupported K, Q or J, and suits an opponent can trump.

**Avoiding tricks.** Lead the card least likely to win: ideally one with higher cards still out and no lower ones. Among equally safe cards, lead the biggest.

### Following

**Taking tricks:**

- Partner is winning: play low. Never overtake partner.
- Cannot win: play low, or discard.
- Last to play: win with the cheapest card that does it.
- Holding the boss of the suit: play it.
- Second to play without the boss: play low and leave it to partner.
- Third to play: play the highest card.
- Out of the suit: trump with the lowest spade that wins.
- Of touching cards (for example K and Q), the cheaper one is played.

**Avoiding tricks:**

- Play the highest card that still loses.
- Out of the suit: discard boss cards and high cards first, and get rid of spades when a higher spade is already winning.
- Forced to win and last to play: win with the biggest card.
- Forced to beat the current card but not last: play the lowest and hope to be overtaken.

**Discarding while taking tricks:** keep spades and boss cards; throw low cards from short suits.

### When the bot bid Nil

- **Leading:** the safest card, as in "avoiding tricks".
- **Following suit:** the highest card that stays under the current winner.
- **Out of the suit:** throw the most dangerous card: high spades if a higher spade is winning, otherwise the highest side card, with short suits first.
- **Forced over the current card:** lowest card if others still play after, highest if last.

### When partner bid Nil

- **Leading:** a suit partner is known to be out of comes first, since partner can discard freely. Otherwise lead the card with the fewest higher cards still out, so partner can get under it.
- **Partner has played and is winning:** overtake with the cheapest card that wins.
- **Partner has not played yet:** if the current winner is weak (below a queen, not a boss, not a trump), play the highest winner in the suit, or trump in.
- **Partner is safe on this trick:** play normally, but keep high cards for later cover instead of shedding them.

### When an opponent bid Nil

- **Leading:** a low card in a suit the Nil bidder still holds, preferring cards with almost nothing lower still out. Skipped if the Nil bidder's partner can trump it, or if the bot's own bid is too tight (fewer than 2 tricks to spare).
- **Nil bidder is winning the trick:** play under them with the highest card that still loses; do not trump.
- **Nil bidder has not played and the bot is avoiding tricks:** play low so they may be forced over.
- Otherwise play normally.

## Tunables

At the top of [`src/bot/bot.ts`](../src/bot/bot.ts):

| Name | Value | Meaning |
|---|---|---|
| `nilMaxRisk` | 0.5 | Bid Nil when the risk score is below this |
| `bidShade` | 0.15 | Subtracted from the trick estimate before rounding |
| `nilPartnerBonus` | 0.3 | Added to the estimate when partner bid Nil |
| `setMaxExtraTricks` | 2 | Most extra tricks to spend on setting the opponents |

## Testing a change

The simulator plays full games between two bots and prints win rate, set rate, bags and Nil results:

```bash
npm run sim -- 2000 1 new old
```

The arguments are number of games, random seed, bot A and bot B. `old` is a frozen copy of the original bot in [`scripts/legacyBot.ts`](../scripts/legacyBot.ts). To try a different tunable without editing code, compare it against the current bot:

```bash
npm run sim -- 4000 1 new:nilMaxRisk=0.6 new
```

Win rates between identical bots vary by about 1.5 points per 3,000 games, so treat smaller differences as noise.

Baseline when this was written (4,000 games, new against old): new won 93.3%, was set on 3.1% of bids against 22.5%, and made 81.6% of Nil bids against 30.1%.

## Not implemented yet

- Inferring what a Nil bidder holds from the cards they play.
- End-of-game bidding (for example, bidding exactly what is needed to reach 500).
- Signalling to partner through the choice of discard.
- Difficulty levels.
