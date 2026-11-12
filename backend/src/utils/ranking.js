export const RANK_TIERS = [
  {
    level: 1,
    name: 'Beginner',
    minKm: 0,
    minExpeditions: 0,
    minAchievements: 0,
    badgeColor: '#9CA3AF',
    summary: 'Starting the Himalayan journey.',
  },
  {
    level: 2,
    name: 'Explorer',
    minKm: 500,
    minExpeditions: 1,
    minAchievements: 0,
    badgeColor: '#60A5FA',
    summary: 'Completed an expedition and logged 500+ verified km.',
  },
  {
    level: 3,
    name: 'Adventurer',
    minKm: 2000,
    minExpeditions: 2,
    minAchievements: 1,
    badgeColor: '#34D399',
    summary: 'Proven across multiple high-altitude routes with earned badges.',
  },
  {
    level: 4,
    name: 'Nomad',
    minKm: 5000,
    minExpeditions: 4,
    minAchievements: 1,
    badgeColor: '#F59E0B',
    summary: 'Seasoned long-range rider with 5,000+ verified km.',
  },
  {
    level: 5,
    name: 'Pathfinder',
    minKm: 10000,
    minExpeditions: 7,
    minAchievements: 2,
    badgeColor: '#F97316',
    summary: 'Veteran expedition lead across remote mountain corridors.',
  },
  {
    level: 6,
    name: 'Himalayan Legend',
    minKm: 20000,
    minExpeditions: 12,
    minAchievements: 2,
    badgeColor: '#F3C744',
    summary: 'Elite master of Himalayan touring.',
  },
];

export function computeRiderRank(verifiedKilometres = 0, completedExpeditions = 0, achievementCount = 0) {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (
      verifiedKilometres >= tier.minKm &&
      completedExpeditions >= tier.minExpeditions &&
      achievementCount >= (tier.minAchievements || 0)
    ) {
      current = tier;
    }
  }
  return current.name;
}

export function getTierProgress(
  verifiedKilometres = 0,
  completedExpeditions = 0,
  currentRank = 'Beginner',
  achievementCount = 0
) {
  const idx = RANK_TIERS.findIndex((t) => t.name === currentRank);
  const currentTier = RANK_TIERS[idx >= 0 ? idx : 0];
  const nextTier = idx >= 0 && idx < RANK_TIERS.length - 1 ? RANK_TIERS[idx + 1] : null;

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      kmProgressPercent: 100,
      remainingKm: 0,
      remainingExpeditions: 0,
      remainingAchievements: 0,
    };
  }

  const span = Math.max(1, nextTier.minKm - currentTier.minKm);
  const covered = Math.max(0, verifiedKilometres - currentTier.minKm);
  const kmProgressPercent = Math.min(100, Math.round((covered / span) * 100));

  return {
    currentTier,
    nextTier,
    kmProgressPercent,
    remainingKm: Math.max(0, nextTier.minKm - verifiedKilometres),
    remainingExpeditions: Math.max(0, nextTier.minExpeditions - completedExpeditions),
    remainingAchievements: Math.max(0, (nextTier.minAchievements || 0) - achievementCount),
  };
}
