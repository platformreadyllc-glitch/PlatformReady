import type { Platform } from './platform';
import type { Button, Decision } from './enums';

export interface CardSet {
  red: boolean;
  blue: boolean;
  yellow: boolean;
}

export interface RefereeDecision {
  decision: Decision;
  cards: CardSet;
}

export interface DecisionOutcome {
  outcome: Decision;
  decisions: Record<string, Button>;
  goodVotes: number;
  badVotes: number;
}

export function buttonToDecision(button: Button): RefereeDecision {
  switch (button) {
    case 'white':
      return { decision: 'good', cards: { red: false, blue: false, yellow: false } };
    case 'red':
      return { decision: 'bad', cards: { red: true, blue: false, yellow: false } };
    case 'blue':
      return { decision: 'bad', cards: { red: false, blue: true, yellow: false } };
    case 'yellow':
      return { decision: 'bad', cards: { red: false, blue: false, yellow: true } };
    default:
      throw new Error(`Invalid vote button: ${button}`);
  }
}

export function determineDecisionOutcome(platform: Platform): DecisionOutcome {
  const votes = platform.getRefereeVotes();
  const activeRoles = ['left', 'right', 'chief'];

  for (const role of activeRoles) {
    if (!(role in votes)) {
      throw new Error(`Missing vote for role: ${role}`);
    }
    if (votes[role] === null) {
      throw new Error(`Role ${role} has not voted yet`);
    }
  }

  const decisions: Record<string, Button> = {};
  let goodVotes = 0;
  let badVotes = 0;

  for (const role of activeRoles) {
    const button = votes[role] as Button;
    decisions[role] = button;
    if (button === 'white') {
      goodVotes++;
    } else {
      badVotes++;
    }
  }

  return {
    outcome: goodVotes >= 2 ? 'good' : 'bad',
    decisions,
    goodVotes,
    badVotes,
  };
}
