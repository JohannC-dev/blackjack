import { randomInt, randomUUID } from "node:crypto";
import { makeRoomRuntime } from "./rooms";
import { gameEffect } from "./effect";
import type { Player } from "./engine";
import { inMemoryGameWallet, type GameWallet } from "./game-wallet";
import type {
  Card,
  PokerAction,
  PokerChatMessage,
  PokerClientState,
  PokerCommand,
  PokerHistoryItem,
  PokerMode,
  PokerSeat,
  PokerTableState,
  Suit,
} from "../src/lib/types";
import {
  comparePokerScore,
  describePokerHand,
  describePokerHolding,
  evaluatePokerHand,
} from "../src/lib/rules";

export { evaluatePokerHand } from "../src/lib/rules";

export const CASH_LIMITS = new Map([
  [5_000, { smallBlind: 2_500, bigBlind: 5_000 }],
  [20_000, { smallBlind: 10_000, bigBlind: 20_000 }],
  [100_000, { smallBlind: 50_000, bigBlind: 100_000 }],
]);
export const SPIN_BUY_INS = [
  5_000, 20_000, 100_000, 500_000, 2_000_000,
] as const;
const SPIN_LEVELS = [
  [10, 20],
  [15, 30],
  [25, 50],
  [50, 100],
  [75, 150],
  [100, 200],
  [150, 300],
  [250, 500],
] as const;
const ACTION_MS = { cash: 25_000, spin: 15_000 } as const;
const UNCONTESTED_REVEAL_MS = 3_000;
export const POKER_SHUFFLE_MS = 2_200;

type Participant = {
  player: Player;
  seat: number;
  stack: number;
  bet: number;
  committed: number;
  status: PokerSeat["status"];
  cards: Card[];
  mucked: boolean;
  lastAction?: string;
  lastManualAction: number;
  disconnectedAt: number | null;
  pendingLeave: boolean;
  chatJoinedAt: number;
  walletReferenceId: string;
};

export function makePokerDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ["hearts", "diamonds", "clubs", "spades"] as Suit[])
    for (let rank = 1; rank <= 13; rank++)
      deck.push({ id: randomUUID(), rank, suit });
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function spinMultiplier() {
  const roll = randomInt(10_000);
  if (roll < 7_500) return 2;
  if (roll < 9_300) return 3;
  if (roll < 9_800) return 5;
  if (roll < 9_950) return 10;
  if (roll < 9_990) return 25;
  if (roll < 9_999) return 100;
  return 1_000;
}

export class PokerTable {
  readonly id: string;
  readonly maxSeats: number;
  participants: Participant[] = [];
  phase: PokerTableState["phase"] = "waiting";
  hand = 0;
  community: Card[] = [];
  deck: Card[] = [];
  button = -1;
  smallBlindSeat = -1;
  bigBlindSeat = -1;
  currentBet = 0;
  minRaise: number;
  activePlayerId: string | null = null;
  deadline: number | null = null;
  revealDeadline: number | null = null;
  wheelMultiplier: number | null = null;
  wheelSpinning = false;
  history: PokerHistoryItem[] = [];
  chat: PokerChatMessage[] = [];
  message = "En attente de joueurs.";
  nextStepAt = 0;
  streetStepAt = 0;
  level = 0;
  levelStartedAt = 0;
  lonelySince = 0;
  private acted = new Set<string>();
  private raiseClosedFor = new Set<string>();
  private deadContributions: number[] = [];
  prizePaid = false;

  constructor(
    readonly mode: PokerMode,
    readonly stake: number,
    readonly smallBlind: number,
    readonly initialBigBlind: number,
    private publish: () => void,
    id = `PKR-${randomUUID().slice(0, 8).toUpperCase()}`,
  ) {
    this.id = id;
    this.maxSeats = mode === "spin" ? 3 : 5;
    this.minRaise = initialBigBlind;
  }

  get bigBlind() {
    if (this.mode === "cash") return this.initialBigBlind;
    if (this.level < SPIN_LEVELS.length) return SPIN_LEVELS[this.level][1];
    return SPIN_LEVELS.at(-1)![1] * 2 ** (this.level - SPIN_LEVELS.length + 1);
  }

  get currentSmallBlind() {
    if (this.mode === "cash") return this.smallBlind;
    if (this.level < SPIN_LEVELS.length) return SPIN_LEVELS[this.level][0];
    return Math.ceil(this.bigBlind / 2);
  }

  add(
    player: Player,
    stack: number,
    walletReferenceId = `poker:${this.id}:${player.id}:${randomUUID()}`,
  ) {
    const available = Array.from(
      { length: this.maxSeats },
      (_, seat) => seat,
    ).find((seat) => !this.participants.some((entry) => entry.seat === seat));
    if (available === undefined) throw new Error("Cette table est complète.");
    this.participants.push({
      player,
      seat: available,
      stack,
      bet: 0,
      committed: 0,
      status: "waiting",
      cards: [],
      mucked: false,
      lastManualAction: Date.now(),
      disconnectedAt: null,
      pendingLeave: false,
      chatJoinedAt: Date.now(),
      walletReferenceId,
    });
    this.participants.sort((a, b) => a.seat - b.seat);
    this.message = `${player.name} rejoint la table.`;
    if (this.mode === "spin" && this.participants.length === 3) {
      this.phase = "spinning";
      this.wheelMultiplier = spinMultiplier();
      this.wheelSpinning = true;
      this.nextStepAt = Date.now() + 4_000;
      this.message = `La roue révèle un gain ×${this.wheelMultiplier}.`;
    } else if (this.mode === "cash" && this.eligible().length >= 2)
      this.nextStepAt ||= Date.now() + 800;
    this.publish();
  }

  reconnect(playerId: string) {
    const entry = this.find(playerId);
    entry.player.connected = true;
    entry.disconnectedAt = null;
    this.publish();
  }

  disconnect(playerId: string) {
    const entry = this.participants.find((item) => item.player.id === playerId);
    if (!entry) return;
    entry.player.connected = false;
    entry.disconnectedAt = Date.now();
    if (entry.player.id === this.activePlayerId) this.autoAct(entry);
    this.publish();
  }

  remove(playerId: string) {
    const entry = this.find(playerId);
    if (this.inHand() && entry.status !== "folded" && entry.status !== "out") {
      entry.status = "folded";
      entry.lastAction = "Quitté";
      if (entry.player.id === this.activePlayerId)
        this.continueAfterAction(entry);
    }
    this.participants = this.participants.filter((item) => item !== entry);
    this.publish();
    return entry;
  }

  requestLeave(playerId: string) {
    const entry = this.find(playerId);
    if (!this.inHand() || entry.status === "waiting")
      return this.remove(playerId);
    const wasActive = entry.player.id === this.activePlayerId;
    entry.status = "folded";
    if (entry.committed > 0) this.deadContributions.push(entry.committed);
    this.participants = this.participants.filter((item) => item !== entry);
    if (wasActive) this.continueAfterAction(entry);
    else {
      const contenders = this.participants.filter(
        (candidate) =>
          candidate.status === "active" || candidate.status === "all-in",
      );
      if (contenders.length === 1) this.awardUncontested(contenders[0]);
      else this.publish();
    }
    return entry;
  }

  private find(playerId: string) {
    const entry = this.participants.find((item) => item.player.id === playerId);
    if (!entry) throw new Error("Vous n’êtes pas à cette table.");
    return entry;
  }

  inHand() {
    return ["preflop", "flop", "turn", "river"].includes(this.phase);
  }

  private eligible() {
    return this.participants.filter(
      (entry) => entry.stack > 0 && entry.status !== "out",
    );
  }

  private nextSeat(from: number, filter: (entry: Participant) => boolean) {
    for (let offset = 1; offset <= this.maxSeats; offset++) {
      const seat = (from + offset) % this.maxSeats;
      const found = this.participants.find(
        (entry) => entry.seat === seat && filter(entry),
      );
      if (found) return found;
    }
    return null;
  }

  private draw() {
    const card = this.deck.pop();
    if (!card) throw new Error("Le paquet est vide.");
    return card;
  }

  private burn() {
    this.draw();
  }

  private commit(entry: Participant, amount: number) {
    const paid = Math.max(0, Math.min(entry.stack, Math.round(amount)));
    entry.stack -= paid;
    entry.bet += paid;
    entry.committed += paid;
    if (entry.stack === 0) entry.status = "all-in";
    return paid;
  }

  private postBlind(entry: Participant, amount: number, label: string) {
    this.commit(entry, amount);
    entry.lastAction = label;
  }

  private startShuffle(now = Date.now()) {
    const players = this.eligible();
    if (players.length < 2) {
      this.phase = this.mode === "spin" ? "complete" : "waiting";
      this.setTurn(null);
      this.nextStepAt = 0;
      this.message = "En attente d’un adversaire.";
      this.lonelySince ||= now;
      this.publish();
      return;
    }
    this.phase = "shuffling";
    this.setTurn(null);
    this.revealDeadline = null;
    this.community = [];
    this.deadContributions = [];
    this.streetStepAt = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.smallBlindSeat = -1;
    this.bigBlindSeat = -1;
    for (const entry of this.participants) {
      entry.bet = 0;
      entry.committed = 0;
      entry.cards = [];
      entry.mucked = false;
      entry.lastAction = undefined;
      entry.status = entry.stack > 0 ? "waiting" : "out";
    }
    this.nextStepAt = now + POKER_SHUFFLE_MS;
    this.message = "Le croupier mélange le jeu…";
    this.publish();
  }

  startHand(now = Date.now()) {
    this.revealDeadline = null;
    const players = this.eligible();
    if (players.length < 2) {
      this.phase = this.mode === "spin" ? "complete" : "waiting";
      this.activePlayerId = null;
      this.deadline = null;
      this.message = "En attente d’un adversaire.";
      this.lonelySince ||= now;
      this.publish();
      return;
    }
    this.hand++;
    this.lonelySince = 0;
    this.phase = "preflop";
    this.community = [];
    this.deadContributions = [];
    this.streetStepAt = 0;
    this.deck = makePokerDeck();
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.acted.clear();
    this.raiseClosedFor.clear();
    for (const entry of this.participants) {
      entry.bet = 0;
      entry.committed = 0;
      entry.cards = [];
      entry.mucked = false;
      entry.lastAction = undefined;
      entry.status = entry.stack > 0 ? "active" : "out";
    }
    const nextButton =
      this.button < 0
        ? players[randomInt(players.length)]
        : this.nextSeat(this.button, (entry) => entry.status === "active");
    this.button = nextButton!.seat;
    const headsUp = players.length === 2;
    const small = headsUp
      ? nextButton!
      : this.nextSeat(this.button, (entry) => entry.status === "active")!;
    const big = this.nextSeat(
      small.seat,
      (entry) => entry.status === "active",
    )!;
    this.smallBlindSeat = small.seat;
    this.bigBlindSeat = big.seat;
    this.postBlind(small, this.currentSmallBlind, "Small blind");
    this.postBlind(big, this.bigBlind, "Big blind");
    this.currentBet = Math.max(small.bet, big.bet);
    for (let round = 0; round < 2; round++)
      for (let offset = 1; offset <= this.maxSeats; offset++) {
        const seat = (this.button + offset) % this.maxSeats;
        const entry = this.participants.find(
          (candidate) => candidate.seat === seat && candidate.status !== "out",
        );
        if (entry) entry.cards.push(this.draw());
      }
    const first = headsUp
      ? small
      : this.nextSeat(big.seat, (entry) => entry.status === "active")!;
    this.setTurn(first, now);
    this.message = `Hand ${this.hand} · ${this.currentSmallBlind}/${this.bigBlind}.`;
    this.nextStepAt = 0;
    this.publish();
  }

  private setTurn(entry: Participant | null, now = Date.now()) {
    this.activePlayerId = entry?.player.id ?? null;
    this.deadline = entry ? now + ACTION_MS[this.mode] : null;
  }

  private shouldRunoutAfterAllIn() {
    const contenders = this.participants.filter(
      (candidate) =>
        candidate.status === "active" || candidate.status === "all-in",
    );
    return (
      contenders.length === 2 &&
      contenders.some((candidate) => candidate.status === "all-in")
    );
  }

  private callAllInAmount() {
    for (const entry of this.participants) {
      if (entry.status !== "active") continue;
      const toCall = Math.max(0, this.currentBet - entry.bet);
      if (!toCall) continue;
      const paid = this.commit(entry, toCall);
      entry.lastAction = paid < toCall ? "All-in" : `Call ${paid}`;
    }
  }

  action(playerId: string, action: PokerAction, amount?: number) {
    const entry = this.find(playerId);
    if (entry.player.id !== this.activePlayerId)
      throw new Error("Ce n’est pas à vous de jouer.");
    if (entry.status !== "active") throw new Error("Cette hand est terminée.");
    const toCall = Math.max(0, this.currentBet - entry.bet);
    if (action === "fold") {
      entry.status = "folded";
      entry.lastAction = "Fold";
    } else if (action === "check") {
      if (toCall) throw new Error("Vous devez call ou fold.");
      entry.lastAction = "Check";
    } else if (action === "call") {
      if (!toCall) throw new Error("Aucun call nécessaire.");
      const paid = this.commit(entry, toCall);
      entry.lastAction = paid < toCall ? "All-in" : `Call ${paid}`;
    } else if (action === "all-in") {
      const previous = this.currentBet;
      const target = entry.bet + entry.stack;
      const increase = target - previous;
      this.commit(entry, entry.stack);
      entry.lastAction = "All-in";
      if (target > previous) {
        if (this.raiseClosedFor.has(entry.player.id))
          throw new Error("Cette incomplete raise ne rouvre pas l’action.");
        this.currentBet = target;
        if (increase >= this.minRaise) {
          this.minRaise = increase;
          this.acted.clear();
          this.raiseClosedFor.clear();
        } else {
          for (const actedId of this.acted) this.raiseClosedFor.add(actedId);
        }
      }
    } else {
      if (this.raiseClosedFor.has(entry.player.id))
        throw new Error("Cette incomplete raise ne rouvre pas l’action.");
      const target = Math.round(amount ?? 0);
      const maximum = entry.bet + entry.stack;
      if (target <= this.currentBet)
        throw new Error("Le raise est trop faible.");
      if (target > maximum) throw new Error("Votre stack est insuffisant.");
      const increase = target - this.currentBet;
      if (target !== maximum && increase < this.minRaise)
        throw new Error(`Minimum raise : ${this.currentBet + this.minRaise}.`);
      this.commit(entry, target - entry.bet);
      this.currentBet = target;
      entry.lastAction = `${this.phase === "preflop" ? "Raise" : "Bet"} ${target}`;
      if (increase >= this.minRaise) {
        this.minRaise = increase;
        this.acted.clear();
        this.raiseClosedFor.clear();
      }
    }
    entry.lastManualAction = Date.now();
    this.acted.add(entry.player.id);
    this.continueAfterAction(entry);
  }

  private continueAfterAction(entry: Participant) {
    const contenders = this.participants.filter(
      (candidate) =>
        candidate.status === "active" || candidate.status === "all-in",
    );
    if (contenders.length === 1) {
      this.awardUncontested(contenders[0]);
      return;
    }
    if (this.shouldRunoutAfterAllIn()) {
      this.callAllInAmount();
      this.scheduleStreet();
      return;
    }
    const canAct = contenders.filter(
      (candidate) => candidate.status === "active",
    );
    const roundComplete = canAct.every(
      (candidate) =>
        this.acted.has(candidate.player.id) &&
        candidate.bet === this.currentBet,
    );
    if (roundComplete || canAct.length === 0) {
      this.scheduleStreet();
      return;
    }
    const next = this.nextSeat(
      entry.seat,
      (candidate) =>
        candidate.status === "active" &&
        (!this.acted.has(candidate.player.id) ||
          candidate.bet < this.currentBet),
    );
    this.setTurn(next);
    this.publish();
  }

  private scheduleStreet(now = Date.now()) {
    this.setTurn(null);
    this.streetStepAt = now + 650;
    this.message = "Le croupier prépare les cartes…";
    this.publish();
  }

  private advanceStreet() {
    for (const entry of this.participants) entry.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.acted.clear();
    this.raiseClosedFor.clear();
    if (this.phase === "river") {
      this.showdown();
      return;
    }
    this.burn();
    if (this.phase === "preflop") {
      this.community.push(this.draw(), this.draw(), this.draw());
      this.phase = "flop";
    } else if (this.phase === "flop") {
      this.community.push(this.draw());
      this.phase = "turn";
    } else {
      this.community.push(this.draw());
      this.phase = "river";
    }
    const active = this.participants.filter(
      (entry) => entry.status === "active",
    );
    if (!active.length || this.shouldRunoutAfterAllIn()) {
      this.scheduleStreet();
      return;
    }
    const first = this.nextSeat(
      this.button,
      (entry) => entry.status === "active",
    );
    this.setTurn(first);
    this.message = `${this.phase === "flop" ? "Flop" : this.phase === "turn" ? "Turn" : "River"}.`;
    this.publish();
  }

  private totalPot() {
    return (
      this.participants.reduce((sum, entry) => sum + entry.committed, 0) +
      this.deadContributions.reduce((sum, amount) => sum + amount, 0)
    );
  }

  private winnerOrder(entries: Participant[]) {
    return [...entries].sort((a, b) => {
      const distanceA = (a.seat - this.button + this.maxSeats) % this.maxSeats;
      const distanceB = (b.seat - this.button + this.maxSeats) % this.maxSeats;
      return distanceA - distanceB;
    });
  }

  private awardUncontested(winner: Participant) {
    const amount = this.totalPot();
    winner.stack += amount;
    this.finishHand([{ entry: winner, amount, label: "Uncontested pot" }]);
  }

  private showdown() {
    this.phase = "showdown";
    this.setTurn(null);
    const levels = [
      ...new Set(
        [
          ...this.participants.map((entry) => entry.committed),
          ...this.deadContributions,
        ].filter(Boolean),
      ),
    ].sort((a, b) => a - b);
    let previous = 0;
    const payouts = new Map<Participant, { amount: number; label: string }>();
    for (const level of levels) {
      const contributors = this.participants.filter(
        (entry) => entry.committed >= level,
      );
      const deadContributorCount = this.deadContributions.filter(
        (amount) => amount >= level,
      ).length;
      const pot =
        (level - previous) * (contributors.length + deadContributorCount);
      previous = level;
      const eligible = contributors.filter(
        (entry) => entry.status !== "folded" && entry.status !== "out",
      );
      if (!eligible.length) continue;
      const values = eligible.map((entry) => ({
        entry,
        value: evaluatePokerHand([...entry.cards, ...this.community]),
      }));
      values.sort((a, b) => comparePokerScore(b.value.score, a.value.score));
      const winners = values.filter(
        (item) =>
          comparePokerScore(item.value.score, values[0].value.score) === 0,
      );
      const share = Math.floor(pot / winners.length);
      let remainder = pot - share * winners.length;
      for (const winner of this.winnerOrder(
        winners.map((item) => item.entry),
      )) {
        const found = winners.find((item) => item.entry === winner)!;
        const amount = share + (remainder-- > 0 ? 1 : 0);
        winner.stack += amount;
        const existing = payouts.get(winner);
        payouts.set(winner, {
          amount: (existing?.amount ?? 0) + amount,
          label: describePokerHand(found.value),
        });
      }
    }
    this.finishHand(
      [...payouts].map(([entry, result]) => ({ entry, ...result })),
    );
  }

  private finishHand(
    winners: { entry: Participant; amount: number; label: string }[],
  ) {
    const finishedAt = Date.now();
    const uncontested =
      winners.length === 1 && winners[0].label === "Uncontested pot";
    this.phase = "showdown";
    this.setTurn(null);
    this.streetStepAt = 0;
    const pot = winners.reduce((sum, winner) => sum + winner.amount, 0);
    for (const entry of this.participants) entry.mucked = false;
    this.history.unshift({
      hand: this.hand,
      community: this.community.map((card) => ({ ...card })),
      pot,
      winners: winners.map(({ entry, amount, label }) => ({
        playerId: entry.player.id,
        name: entry.player.name,
        amount,
        label,
        cards: entry.cards.map((card) => ({ ...card })),
        mucked: uncontested,
      })),
      timestamp: finishedAt,
    });
    this.history = this.history.slice(0, 10);
    this.message = winners
      .map((winner) => `${winner.entry.player.name} gagne ${winner.amount}`)
      .join(" · ");
    for (const { entry } of winners) entry.mucked = uncontested;
    this.revealDeadline = uncontested
      ? finishedAt + UNCONTESTED_REVEAL_MS
      : null;
    for (const entry of this.participants)
      if (entry.stack === 0) entry.status = "out";
    const remaining = this.participants.filter((entry) => entry.stack > 0);
    if (this.mode === "spin" && remaining.length === 1) {
      this.phase = "complete";
      this.nextStepAt = 0;
    } else
      this.nextStepAt = uncontested
        ? finishedAt + UNCONTESTED_REVEAL_MS
        : finishedAt + 5_000;
    this.publish();
  }

  muck(playerId: string) {
    const entry = this.find(playerId);
    if (this.phase !== "showdown")
      throw new Error("You can only muck after the showdown.");
    const result = this.history.find((item) => item.hand === this.hand);
    const winner = result?.winners.find(
      (candidate) => candidate.playerId === playerId,
    );
    if (!winner) throw new Error("Only a winner can muck their hand.");
    entry.mucked = true;
    winner.mucked = true;
    winner.cards = [];
    this.revealDeadline = null;
    entry.lastAction = "Muck";
    this.publish();
  }

  show(playerId: string) {
    const entry = this.find(playerId);
    if (this.phase !== "showdown")
      throw new Error("You can only show after the hand.");
    if (!this.revealDeadline || Date.now() >= this.revealDeadline)
      throw new Error("The reveal window has closed.");
    const result = this.history.find((item) => item.hand === this.hand);
    const winner = result?.winners.find(
      (candidate) => candidate.playerId === playerId,
    );
    if (!winner || winner.label !== "Uncontested pot")
      throw new Error("Only an uncontested winner can show their hand.");
    entry.mucked = false;
    winner.mucked = false;
    winner.cards = entry.cards.map((card) => ({ ...card }));
    this.revealDeadline = null;
    entry.lastAction = "Show";
    this.publish();
  }

  private autoAct(entry: Participant) {
    if (entry.player.id !== this.activePlayerId) return;
    const toCall = this.currentBet - entry.bet;
    if (toCall > 0) {
      entry.status = "folded";
      entry.lastAction = "Fold auto";
    } else entry.lastAction = "Check auto";
    this.acted.add(entry.player.id);
    this.continueAfterAction(entry);
  }

  chatMessage(playerId: string, text: string) {
    const entry = this.find(playerId);
    const clean = text
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 240);
    if (!clean) throw new Error("Le message est vide.");
    const recent = this.chat.filter(
      (message) =>
        message.playerId === playerId &&
        Date.now() - message.timestamp < 10_000,
    );
    if (recent.length >= 5)
      throw new Error("Un instant… vous écrivez trop vite.");
    this.chat.push({
      id: randomUUID(),
      playerId,
      name: entry.player.name,
      text: clean,
      timestamp: Date.now(),
    });
    this.chat = this.chat.slice(-40);
    this.publish();
  }

  tick(now: number) {
    if (this.streetStepAt && now >= this.streetStepAt) {
      this.streetStepAt = 0;
      this.advanceStreet();
      return;
    }
    if (
      this.mode === "cash" &&
      this.phase === "waiting" &&
      this.nextStepAt &&
      now >= this.nextStepAt
    ) {
      this.startShuffle(now);
      return;
    }
    if (
      this.mode === "spin" &&
      this.phase === "spinning" &&
      now >= this.nextStepAt
    ) {
      this.wheelSpinning = false;
      this.levelStartedAt = now;
      this.startShuffle(now);
      return;
    }
    if (
      this.phase === "shuffling" &&
      this.nextStepAt &&
      now >= this.nextStepAt
    ) {
      this.startHand(now);
      return;
    }
    if (
      this.mode === "spin" &&
      this.inHand() &&
      now - this.levelStartedAt >= 120_000
    ) {
      this.level++;
      this.levelStartedAt = now;
      this.message = `Blinds ${this.currentSmallBlind}/${this.bigBlind}.`;
      this.publish();
    }
    if (this.deadline && now >= this.deadline) {
      const active = this.participants.find(
        (entry) => entry.player.id === this.activePlayerId,
      );
      if (active) this.autoAct(active);
    }
    if (
      this.nextStepAt &&
      now >= this.nextStepAt &&
      this.phase === "showdown"
    ) {
      this.nextStepAt = 0;
      this.startShuffle(now);
    }
  }

  snapshot(viewerId: string): PokerTableState {
    const reveal =
      this.phase === "showdown" ||
      this.phase === "complete" ||
      (this.inHand() && this.shouldRunoutAfterAllIn());
    const revealChoiceWinnerId = this.revealDeadline
      ? this.history
          .find((item) => item.hand === this.hand)
          ?.winners.find((winner) => winner.label === "Uncontested pot")
          ?.playerId
      : undefined;
    return {
      id: this.id,
      mode: this.mode,
      stake: this.stake,
      smallBlind: this.currentSmallBlind,
      bigBlind: this.bigBlind,
      phase: this.phase,
      hand: this.hand,
      seats: this.participants.map((entry) => ({
        id: entry.player.id,
        name: entry.player.name,
        seat: entry.seat,
        stack: entry.stack,
        bet: entry.bet,
        committed: entry.committed,
        connected: entry.player.connected,
        status: entry.status,
        cards:
          (!entry.mucked ||
            (entry.player.id === viewerId &&
              entry.player.id === revealChoiceWinnerId)) &&
          (entry.player.id === viewerId ||
            (reveal && entry.status !== "folded"))
            ? entry.cards.map((card) => ({ ...card }))
            : entry.cards.map((card) => ({
                id: card.id,
                rank: 0,
                suit: "spades",
                hidden: true,
              })),
        mucked: entry.mucked,
        handLabel:
          (!entry.mucked ||
            (entry.player.id === viewerId &&
              entry.player.id === revealChoiceWinnerId)) &&
          (entry.player.id === viewerId ||
            (reveal && entry.status !== "folded"))
            ? describePokerHolding(entry.cards, this.community)
            : undefined,
        lastAction: entry.lastAction,
      })),
      community: this.community.map((card) => ({ ...card })),
      pot: this.totalPot(),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      button: this.button,
      smallBlindSeat: this.smallBlindSeat,
      bigBlindSeat: this.bigBlindSeat,
      activePlayerId: this.activePlayerId,
      deadline: this.deadline,
      revealDeadline: this.revealDeadline,
      wheelMultiplier: this.wheelMultiplier,
      wheelSpinning: this.wheelSpinning,
      history: this.history.map((item) => ({
        ...item,
        community: item.community.map((card) => ({ ...card })),
        winners: item.winners.map((winner) => ({
          ...winner,
          cards: winner.mucked ? [] : winner.cards.map((card) => ({ ...card })),
        })),
      })),
      chat: this.chat
        .filter(
          (message) => message.timestamp >= this.find(viewerId).chatJoinedAt,
        )
        .map((message) => ({ ...message })),
      message: this.message,
    };
  }
}

type QueueEntry = {
  id: string;
  player: Player;
  stake: number;
  joinedAt: number;
};

export class PokerManager {
  private tables = new Map<string, PokerTable>();
  private rooms = makeRoomRuntime(
    "poker",
    () => `PKR-${randomUUID().slice(0, 8).toUpperCase()}`,
  );
  private queued = new Map<string, number>();
  private queues = new Map<number, QueueEntry[]>();

  constructor(
    private send: (playerId: string, state: PokerClientState) => void,
    private readonly wallet: GameWallet = inMemoryGameWallet,
  ) {}

  /** Players seated at the same poker table, the player included. */
  tableMatesOf(playerId: string) {
    const table = this.tables.get(this.rooms.roomOf(playerId) ?? "");
    return table?.participants.map((entry) => entry.player.id) ?? [];
  }

  private lobby(player: Player): PokerClientState {
    return { status: "lobby", balance: player.balance };
  }

  state(player: Player) {
    const stake = this.queued.get(player.id);
    if (stake !== undefined) {
      return {
        status: "queue" as const,
        balance: player.balance,
        queue: {
          mode: "spin" as const,
          stake,
          waiting: this.queues.get(stake)?.length ?? 0,
        },
      };
    }
    const table = this.tables.get(this.rooms.roomOf(player.id) ?? "");
    return table
      ? {
          status: "table" as const,
          balance: player.balance,
          table: table.snapshot(player.id),
        }
      : this.lobby(player);
  }

  connect(player: Player) {
    const tableId = this.rooms.roomOf(player.id);
    const table = tableId ? this.tables.get(tableId) : undefined;
    if (table) table.reconnect(player.id);
    this.send(player.id, this.state(player));
  }

  disconnect(player: Player) {
    if (this.queued.has(player.id)) {
      this.leave(player);
      return;
    }
    this.tables.get(this.rooms.roomOf(player.id) ?? "")?.disconnect(player.id);
  }

  connectEffect(player: Player) {
    return gameEffect(() => this.connect(player));
  }

  disconnectEffect(player: Player) {
    return gameEffect(() => this.disconnect(player));
  }

  private publishTable(table: PokerTable) {
    for (const entry of table.participants)
      this.send(entry.player.id, this.state(entry.player));
  }

  private publishQueue(stake: number) {
    for (const entry of this.queues.get(stake) ?? [])
      this.send(entry.player.id, this.state(entry.player));
  }

  command(player: Player, command: PokerCommand) {
    if (command.type === "match")
      this.match(player, command.mode, command.stake, command.buyIn);
    else if (command.type === "leave") this.leave(player);
    else {
      const table = this.tables.get(this.rooms.roomOf(player.id) ?? "");
      if (!table) throw new Error("Vous n’êtes pas à une table de poker.");
      if (command.type === "chat") table.chatMessage(player.id, command.text);
      else if (command.type === "muck") table.muck(player.id);
      else if (command.type === "show") table.show(player.id);
      else {
        table.action(player.id, command.action, command.amount);
        this.settleSpin(table);
      }
    }
  }

  private match(
    player: Player,
    mode: PokerMode,
    stake: number,
    requestedBuyIn?: number,
  ) {
    if (this.queued.has(player.id) || this.rooms.roomOf(player.id))
      throw new Error("Vous jouez déjà au poker.");
    if (mode === "spin") {
      if (!SPIN_BUY_INS.includes(stake as (typeof SPIN_BUY_INS)[number]))
        throw new Error("Ce buy-in Spin & Play n’existe pas.");
      if (this.wallet.balance(player) < stake)
        throw new Error("Votre solde est insuffisant.");
      const entryId = randomUUID();
      this.wallet.debit(player, {
        operationId: `poker:${entryId}:buy-in`,
        game: "poker",
        kind: "buy-in",
        reason: "spin-match",
        referenceId: entryId,
        amount: stake,
        metadata: { mode, stake },
      });
      const queue = this.queues.get(stake) ?? [];
      queue.push({ id: entryId, player, stake, joinedAt: Date.now() });
      this.queues.set(stake, queue);
      this.queued.set(player.id, stake);
      if (queue.length >= 3) {
        const matched = queue.splice(0, 3);
        const room = this.rooms.create("public");
        const table = new PokerTable(
          "spin",
          stake,
          10,
          20,
          () => this.publishTable(table),
          room.id,
        );
        this.tables.set(table.id, table);
        for (const entry of matched) {
          this.queued.delete(entry.player.id);
          this.rooms.join(entry.player.id, table.id);
          table.add(entry.player, 500, entry.id);
        }
      }
      this.publishQueue(stake);
      this.send(player.id, this.state(player));
      return;
    }
    const limit = CASH_LIMITS.get(stake);
    if (!limit) throw new Error("Cette limite n’existe pas.");
    const buyIn = Math.round(requestedBuyIn ?? limit.bigBlind * 100);
    if (buyIn < limit.bigBlind * 40 || buyIn > limit.bigBlind * 100)
      throw new Error("Le buy-in doit être compris entre 40 et 100 BB.");
    if (this.wallet.balance(player) < buyIn)
      throw new Error("Votre solde est insuffisant.");
    const room = this.rooms.publicRoom((room) => {
      const candidate = this.tables.get(room.id);
      return (
        !!candidate &&
        candidate.mode === "cash" &&
        candidate.stake === stake &&
        candidate.participants.length < candidate.maxSeats
      );
    });
    let table = this.tables.get(room.id);
    if (!table) {
      table = new PokerTable(
        "cash",
        stake,
        limit.smallBlind,
        limit.bigBlind,
        () => this.publishTable(table!),
        room.id,
      );
      this.tables.set(table.id, table);
    }
    const entryId = randomUUID();
    this.wallet.debit(player, {
      operationId: `poker:${entryId}:buy-in`,
      game: "poker",
      kind: "buy-in",
      reason: "cash-match",
      referenceId: entryId,
      amount: buyIn,
      metadata: { mode, stake, tableId: table.id },
    });
    this.rooms.join(player.id, table.id);
    table.add(player, buyIn, entryId);
    this.send(player.id, this.state(player));
  }

  leave(player: Player) {
    const queuedStake = this.queued.get(player.id);
    const roomId = this.rooms.roomOf(player.id);
    if (queuedStake === undefined && !roomId) {
      this.send(player.id, this.lobby(player));
      return;
    }
    if (queuedStake !== undefined) {
      const stake = queuedStake;
      const queue = this.queues.get(stake) ?? [];
      const found = queue.find((entry) => entry.player.id === player.id);
      this.queues.set(
        stake,
        queue.filter((entry) => entry !== found),
      );
      if (found)
        this.wallet.credit(player, {
          operationId: `poker:${found.id}:queue-refund`,
          game: "poker",
          kind: "refund",
          reason: "leave-spin-queue",
          referenceId: found.id,
          amount: found.stake,
          metadata: { stake },
        });
      this.queued.delete(player.id);
      this.publishQueue(stake);
      this.send(player.id, this.lobby(player));
      return;
    }
    const table = this.tables.get(roomId!);
    if (table) {
      const entry = table.requestLeave(player.id);
      if (!entry) return;
      if (table.mode === "cash" && entry.stack > 0)
        this.wallet.credit(player, {
          operationId: `poker:${entry.walletReferenceId}:cashout`,
          game: "poker",
          kind: "cashout",
          reason: "leave-cash-table",
          referenceId: entry.walletReferenceId,
          amount: entry.stack,
          metadata: { tableId: table.id, stake: table.stake },
        });
      this.publishTable(table);
    }
    this.rooms.leave(player.id);
    if (roomId && !table?.participants.length) {
      this.tables.delete(roomId);
      this.rooms.deleteEmpty(roomId);
    }
    this.send(player.id, this.lobby(player));
  }

  leaveEffect(player: Player) {
    return gameEffect(() => this.leave(player));
  }

  commandEffect(player: Player, command: PokerCommand) {
    return gameEffect(() => this.command(player, command));
  }

  tickEffect(now?: number) {
    return gameEffect((clock) => this.tick(now ?? clock.now()));
  }
  tick(now: number) {
    for (const [id, table] of this.tables) {
      const spinNoShow =
        table.mode === "spin" &&
        table.phase === "spinning" &&
        table.participants.some(
          (entry) =>
            entry.disconnectedAt && now - entry.disconnectedAt >= 15_000,
        );
      if (spinNoShow) {
        const queue = this.queues.get(table.stake) ?? [];
        for (const entry of table.participants) {
          if (entry.disconnectedAt) {
            this.wallet.credit(entry.player, {
              operationId: `poker:${entry.walletReferenceId}:no-show-refund`,
              game: "poker",
              kind: "refund",
              reason: "spin-no-show",
              referenceId: entry.walletReferenceId,
              amount: table.stake,
              metadata: { tableId: table.id, stake: table.stake },
            });
            this.rooms.leave(entry.player.id);
            this.send(entry.player.id, this.lobby(entry.player));
          } else {
            queue.push({
              id: entry.walletReferenceId,
              player: entry.player,
              stake: table.stake,
              joinedAt: now,
            });
            this.rooms.leave(entry.player.id);
            this.queued.set(entry.player.id, table.stake);
          }
        }
        this.queues.set(table.stake, queue);
        this.tables.delete(id);
        this.rooms.deleteEmpty(id);
        this.publishQueue(table.stake);
        continue;
      }
      table.tick(now);
      this.settleSpin(table);
      if (table.mode === "cash" && table.phase === "waiting") {
        const remaining = table.participants.filter(
          (entry) => entry.stack > 0 && !entry.pendingLeave,
        );
        if (remaining.length === 1) {
          table.lonelySince ||= now;
          if (now - table.lonelySince >= 30_000) {
            const destinationRoom = this.rooms.findPublic((room) => {
              const candidate = this.tables.get(room.id);
              return (
                !!candidate &&
                candidate !== table &&
                candidate.mode === "cash" &&
                candidate.stake === table.stake &&
                candidate.participants.length < candidate.maxSeats
              );
            });
            const destination = destinationRoom
              ? this.tables.get(destinationRoom.id)
              : undefined;
            if (destination) {
              const entry = table.remove(remaining[0].player.id);
              this.rooms.join(entry.player.id, destination.id);
              destination.add(
                entry.player,
                entry.stack,
                entry.walletReferenceId,
              );
              if (!table.participants.length) {
                this.tables.delete(id);
                this.rooms.deleteEmpty(id);
              }
              continue;
            }
            table.lonelySince = now;
          }
        } else table.lonelySince = 0;
      }
      for (const entry of [...table.participants]) {
        const disconnectedTooLong =
          table.mode === "cash" &&
          entry.disconnectedAt &&
          now - entry.disconnectedAt >= 90_000;
        const inactiveTooLong =
          table.mode === "cash" && now - entry.lastManualAction >= 5 * 60_000;
        const busted =
          table.mode === "cash" &&
          entry.stack === 0 &&
          table.phase === "showdown";
        if (
          disconnectedTooLong ||
          inactiveTooLong ||
          busted ||
          (table.mode === "cash" && entry.pendingLeave)
        ) {
          if (table.inHand()) continue;
          if (entry.stack > 0)
            this.wallet.credit(entry.player, {
              operationId: `poker:${entry.walletReferenceId}:cashout`,
              game: "poker",
              kind: "cashout",
              reason: "automatic-cashout",
              referenceId: entry.walletReferenceId,
              amount: entry.stack,
              metadata: { tableId: table.id, stake: table.stake },
            });
          table.remove(entry.player.id);
          this.rooms.leave(entry.player.id);
          this.send(entry.player.id, this.lobby(entry.player));
        }
      }
      if (!table.participants.length) {
        this.tables.delete(id);
        this.rooms.deleteEmpty(id);
      }
    }
  }

  private settleSpin(table: PokerTable) {
    if (table.mode !== "spin" || table.phase !== "complete" || table.prizePaid)
      return;
    const winner = table.participants.find((entry) => entry.stack > 0);
    if (!winner || !table.wheelMultiplier) return;
    const prize = table.stake * table.wheelMultiplier;
    this.wallet.credit(winner.player, {
      operationId: `poker:${table.id}:prize`,
      game: "poker",
      kind: "prize",
      reason: "spin-prize",
      referenceId: table.id,
      amount: prize,
      metadata: { stake: table.stake, multiplier: table.wheelMultiplier },
    });
    table.prizePaid = true;
    table.message = `${winner.player.name} remporte ${prize} crédits.`;
    this.publishTable(table);
  }
}
