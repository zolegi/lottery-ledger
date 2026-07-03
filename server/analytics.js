export function summarizeBets(bets) {
  const ordered = [...bets].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate || a.id - b.id;
  });

  const summary = ordered.reduce(
    (acc, bet) => {
      acc.totalStake += bet.stake;
      acc.totalReturn += bet.returnAmount;
      acc.totalProfit += bet.profit;
      acc.count += 1;
      if (bet.status === "命中") acc.wins += 1;
      if (bet.status === "亏损") acc.losses += 1;
      if (bet.status === "走水") acc.pushes += 1;
      return acc;
    },
    {
      totalStake: 0,
      totalReturn: 0,
      totalProfit: 0,
      currentBalance: 0,
      count: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      hitRate: 0,
      roi: 0,
      profitRate: 0,
      averageStake: 0,
      averageReturn: 0
    }
  );

  summary.currentBalance = summary.totalProfit;
  summary.hitRate = summary.count ? summary.wins / summary.count : 0;
  summary.roi = summary.totalStake ? summary.totalReturn / summary.totalStake : 0;
  summary.profitRate = summary.totalStake ? summary.totalProfit / summary.totalStake : 0;
  summary.averageStake = summary.count ? summary.totalStake / summary.count : 0;
  summary.averageReturn = summary.count ? summary.totalReturn / summary.count : 0;

  const grouped = new Map();
  for (const bet of ordered) {
    if (!grouped.has(bet.date)) {
      grouped.set(bet.date, {
        date: bet.date,
        stake: 0,
        returnAmount: 0,
        profit: 0,
        cumulativeProfit: 0,
        count: 0,
        wins: 0,
        roi: 0,
        profitRate: 0
      });
    }
    const item = grouped.get(bet.date);
    item.stake += bet.stake;
    item.returnAmount += bet.returnAmount;
    item.profit += bet.profit;
    item.count += 1;
    if (bet.status === "命中") item.wins += 1;
  }

  let cumulativeProfit = 0;
  const daily = [...grouped.values()].map((item) => {
    cumulativeProfit += item.profit;
    return {
      ...roundMoneyFields(item),
      cumulativeProfit: round(cumulativeProfit),
      roi: item.stake ? round(item.returnAmount / item.stake, 4) : 0,
      profitRate: item.stake ? round(item.profit / item.stake, 4) : 0,
      hitRate: item.count ? round(item.wins / item.count, 4) : 0
    };
  });

  const statusDistribution = ["命中", "亏损", "走水", "未结算"].map((status) => ({
    status,
    count: ordered.filter((bet) => bet.status === status).length,
    stake: round(ordered.filter((bet) => bet.status === status).reduce((sum, bet) => sum + bet.stake, 0)),
    profit: round(ordered.filter((bet) => bet.status === status).reduce((sum, bet) => sum + bet.profit, 0))
  }));

  return {
    summary: roundMoneyFields(summary),
    daily,
    statusDistribution,
    topWins: [...ordered].sort((a, b) => b.profit - a.profit).slice(0, 5),
    topLosses: [...ordered].sort((a, b) => a.profit - b.profit).slice(0, 5)
  };
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function roundMoneyFields(item) {
  const next = { ...item };
  for (const key of ["totalStake", "totalReturn", "totalProfit", "currentBalance", "averageStake", "averageReturn", "stake", "returnAmount", "profit"]) {
    if (key in next) next[key] = round(next[key]);
  }
  for (const key of ["hitRate", "roi", "profitRate"]) {
    if (key in next) next[key] = round(next[key], 4);
  }
  return next;
}
