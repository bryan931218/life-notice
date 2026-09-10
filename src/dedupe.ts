import type {Importance, Notice} from './domain';

const AUTO_SOURCE = /^\[(?:AI)?自動偵測｜([^\]]+)\]/;
const SNOOZE_SUFFIX = /(?:\s*[（(]\s*(?:貪睡|稍後提醒|稍後再響|snooze|鬧鐘提醒?)\s*[)）]\s*|\s*(?:貪睡|稍後提醒|snooze)\s*)$/i;

export function isAutoDetectedNotice(n: Notice) {
  return AUTO_SOURCE.test(n.source);
}

export function cleanAutoEventTitle(title: string) {
  let value = title.normalize('NFKC').trim();
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(SNOOZE_SUFFIX, '').trim();
  }
  return value || title.trim();
}

export function normalizeEventIdentityTitle(title: string) {
  return cleanAutoEventTitle(title)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u200b-\u200d\ufeff]+/g, '')
    .replace(/[，,。.!！?？:：;；'"「」『』【】\[\]《》<>_\-–—|｜]/g, '');
}

function appFromSource(n: Notice) {
  return AUTO_SOURCE.exec(n.source)?.[1]?.trim().toLowerCase() ?? '';
}

function minuteDistance(a: string | null, b: string | null) {
  if (!a || !b) return null;
  return Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
}

function createdDistanceMinutes(a: Notice, b: Notice) {
  return Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) / 60000;
}

function titleClose(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  return short.length >= 4 && long.includes(short) && short.length / long.length >= 0.8;
}

export function isDuplicateAutoNotice(a: Notice, b: Notice) {
  if (!isAutoDetectedNotice(a) || !isAutoDetectedNotice(b)) return false;
  const appA = appFromSource(a), appB = appFromSource(b);
  if (!appA || !appB || appA !== appB) return false;

  const titleA = normalizeEventIdentityTitle(a.title);
  const titleB = normalizeEventIdentityTitle(b.title);
  if (!titleClose(titleA, titleB)) return false;

  const dueDistance = minuteDistance(a.dueAt, b.dueAt);
  if (dueDistance !== null) {
    // Repeated notifications and snoozed alarms can move by a few minutes.
    // Keep a conservative window so truly separate events are not merged.
    return dueDistance <= 45;
  }

  // If one notification lacks a resolved date, only merge very recent repeats.
  if (!a.dueAt || !b.dueAt) return createdDistanceMinutes(a, b) <= 45 && titleA === titleB;
  return false;
}

const importanceRank: Record<Importance, number> = {normal: 0, important: 1, urgent: 2};
function strongerImportance(a?: Importance, b?: Importance): Importance | undefined {
  if (!a) return b;
  if (!b) return a;
  return importanceRank[a] >= importanceRank[b] ? a : b;
}

function mergeChecklist(a: Notice['checklist'], b: Notice['checklist']) {
  const seen = new Set<string>();
  return [...a, ...b].filter(item => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);
}

function mergeDuplicate(keep: Notice, incoming: Notice): Notice {
  const incomingTimeIsBetter = (!keep.dueAt && !!incoming.dueAt) || (!!keep.needsReview && !incoming.needsReview && !!incoming.dueAt);
  const confidence = Math.max(keep.aiConfidence ?? 0, incoming.aiConfidence ?? 0);
  return {
    ...keep,
    title: cleanAutoEventTitle(keep.title),
    dueAt: incomingTimeIsBetter ? incoming.dueAt : keep.dueAt,
    endAt: incomingTimeIsBetter ? incoming.endAt : keep.endAt,
    allDay: incomingTimeIsBetter ? incoming.allDay : keep.allDay,
    location: keep.location || incoming.location,
    needsReview: Boolean(keep.needsReview && incoming.needsReview),
    aiConfidence: confidence > 0 ? confidence : undefined,
    aiAction: keep.aiAction || incoming.aiAction,
    importance: strongerImportance(keep.importance, incoming.importance),
    checklist: mergeChecklist(keep.checklist, incoming.checklist),
    remindMinutes: keep.remindMinutes ?? incoming.remindMinutes,
    done: keep.done && incoming.done,
    updatedAt: Date.parse(keep.updatedAt) >= Date.parse(incoming.updatedAt) ? keep.updatedAt : incoming.updatedAt,
  };
}

export function dedupeAutoNotices(notices: Notice[]) {
  const result: Notice[] = [];
  for (const original of notices) {
    const n = isAutoDetectedNotice(original) ? {...original, title: cleanAutoEventTitle(original.title)} : original;
    if (!isAutoDetectedNotice(n)) {
      result.push(n);
      continue;
    }
    const index = result.findIndex(existing => isDuplicateAutoNotice(existing, n));
    if (index === -1) result.push(n);
    else result[index] = mergeDuplicate(result[index], n);
  }
  return result;
}
