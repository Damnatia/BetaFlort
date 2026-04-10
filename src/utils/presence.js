export function buildHourlyPresenceMap(profiles = [], hourBucket, baseOnlineMap = {}) {
  const result = {};
  const key = String(hourBucket || '0');

  profiles.forEach((profile) => {
    const id = profile.id || '';
    const baseOnline = !!baseOnlineMap[id];
    if (baseOnline) {
      result[id] = true;
      return;
    }

    const seed = `${id}:${key}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash % 100);
    result[id] = normalized < 42;
  });

  return result;
}
