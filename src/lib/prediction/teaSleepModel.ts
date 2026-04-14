export type TeaEntry = {
  id: string;
  teaTimestamp: string;
  sugarLevel: number;
  cupSize: "S" | "M" | "L";
  brand: string;
  iceLevel: string;
  calories?: number;
  caffeineIntensity?: number;
};

export type PredictionResult = {
  predictedDelayMinutes: number;
  confidence: number;
  insight: string;
  recommendation: string;
};

const sizeWeightMap = {
  S: 1,
  M: 1.2,
  L: 1.5,
} as const;

export function predictTeaImpact(records: TeaEntry[]): PredictionResult {
  if (records.length < 3) {
    return {
      predictedDelayMinutes: 0,
      confidence: 0.2,
      insight: "实验员提示：样本不足，继续记录至少 3 次实验后可生成稳定结论。",
      recommendation: "今天优先记录饮用时间、糖度和杯型。",
    };
  }

  let riskScore = 0;
  let after20Count = 0;

  records.forEach((item) => {
    const teaMinutes = new Date(item.teaTimestamp).getHours() * 60 + new Date(item.teaTimestamp).getMinutes();
    const after20 = teaMinutes >= 20 * 60 ? 1 : 0;
    if (after20) {
      after20Count += 1;
    }
    const caffeineLoad = item.caffeineIntensity ?? 5;
    const intakeLoad =
      item.sugarLevel * sizeWeightMap[item.cupSize] + after20 * 2.5 + (item.calories ?? 0) / 120 + caffeineLoad * 0.7;
    riskScore += intakeLoad;
  });

  const avgRisk = riskScore / records.length;
  const predictedDelayMinutes = Math.round(Math.max(0, (avgRisk - 4) * 12));

  const latest = records[0];
  const latestTeaMins = new Date(latest.teaTimestamp).getHours() * 60 + new Date(latest.teaTimestamp).getMinutes();
  const latestAfter20 = latestTeaMins >= 20 * 60 ? 1 : 0;

  const after20Ratio = after20Count / records.length;
  const confidence = Math.min(0.92, Number((0.4 + records.length * 0.03 + after20Ratio * 0.2).toFixed(2)));

  const recommendation =
    latestAfter20 || latest.sugarLevel >= 8
      ? "建议今晚改为低糖小杯，或将饮用时间提前到 19:30 前。"
      : "当前饮用策略相对稳定，可维持并持续观察。";

  const insight = `实验员提示：基于最近 ${records.length} 次记录，预计当前组合会让你次日起床延后约 ${predictedDelayMinutes} 分钟。`;

  return {
    predictedDelayMinutes,
    confidence,
    insight,
    recommendation,
  };
}
