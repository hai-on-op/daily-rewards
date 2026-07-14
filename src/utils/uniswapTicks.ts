export type SubgraphTick = string | number | { tickIdx: string | number };

export function getSubgraphTickIndex(tick: SubgraphTick): number {
  const rawTick = typeof tick === "object" ? tick?.tickIdx : tick;
  const parsedTick = Number(rawTick);

  if (!Number.isInteger(parsedTick)) {
    throw new Error(`Invalid Uniswap tick value: ${JSON.stringify(tick)}`);
  }

  return parsedTick;
}
