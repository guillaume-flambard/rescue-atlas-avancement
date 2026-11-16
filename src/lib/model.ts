// Le modèle de la page : ce qu'on calcule à partir de la photo de GitHub (src/data/data.json).
// Fonctions pures, testées dans model.test.ts.

export type StatusKey = "Done" | "In review" | "In progress" | "Ready" | "Refinement" | "none";

export interface Person { login: string; avatar: string }
export interface Issue {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  type: string | null;
  status: string | null;
  size: string | null;
  iteration: string | null;
  milestone: number | null;
  parent: number | null;
  labels: string[];
  assignees: Person[];
  blockedBy: number[];
  subs: { total: number; completed: number } | null;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
}
export interface Milestone { number: number; title: string; dueOn: string | null; state: string; description: string | null }
export interface Pull { number: number; title: string; url: string; state: string; createdAt: string; mergedAt: string | null; author: string | null; closes: number[] }
export interface Iteration { title: string; startDate: string; duration: number }
export interface Snapshot {
  generated_at: string;
  repo: string;
  project: string;
  milestones: Milestone[];
  iterations: Iteration[];
  issues: Issue[];
  pulls: Pull[];
}

/** Une couleur par colonne du tableau, et seulement ce sens-là. */
export const STATUS: Record<StatusKey, { label: string; plural: string; hex: string; text: string; order: number }> = {
  "Done":        { label: "Fait",         plural: "faites",           hex: "#1B2747", text: "#1B2747", order: 0 },
  "In review":   { label: "En relecture", plural: "en relecture",     hex: "#234D7A", text: "#234D7A", order: 1 },
  "In progress": { label: "En cours",     plural: "en cours",         hex: "#E83E1B", text: "#C53215", order: 2 },
  "Ready":       { label: "Prête",        plural: "prêtes à prendre", hex: "#17634A", text: "#17634A", order: 3 },
  "Refinement":  { label: "À préparer",   plural: "à préparer",       hex: "#B4B1C4", text: "#596579", order: 4 },
  "none":        { label: "Hors tableau", plural: "hors tableau",     hex: "#D5DAE3", text: "#596579", order: 5 },
};
export const ORDER: StatusKey[] = ["Done", "In review", "In progress", "Ready", "Refinement", "none"];
export const DAY = 86_400_000;

export function statusOf(i: Issue): StatusKey {
  if (i.state === "CLOSED") return "Done";
  return i.status && i.status in STATUS ? (i.status as StatusKey) : "none";
}

export function counts(list: Issue[]): Record<StatusKey, number> {
  const c = Object.fromEntries(ORDER.map((k) => [k, 0])) as Record<StatusKey, number>;
  for (const i of list) c[statusOf(i)]++;
  return c;
}

export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
export const done = (list: Issue[]) => list.filter((i) => statusOf(i) === "Done").length;
export const cleanEpic = (title: string) => title.replace(/^Épopée\s*:\s*/i, "");
/** « 2026-11-30T00:00:00Z » est une date de jalon : un jour, pas un instant. */
export const dueDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

/** Index et liens du projet, calculés une fois. */
export class Project {
  readonly byNum = new Map<number, Issue>();
  readonly kids = new Map<number, Issue[]>();
  readonly frees = new Map<number, Issue[]>();
  readonly epics: Issue[];
  readonly work: Issue[];

  constructor(readonly data: Snapshot) {
    for (const i of data.issues) this.byNum.set(i.number, i);
    for (const i of data.issues) {
      if (i.parent) this.kids.set(i.parent, [...(this.kids.get(i.parent) ?? []), i]);
      for (const b of i.blockedBy) this.frees.set(b, [...(this.frees.get(b) ?? []), i]);
    }
    this.work = data.issues.filter((i) => i.type !== "Epic");
    this.epics = data.issues
      .filter((i) => i.type === "Epic" && !i.parent)
      .sort((a, b) => this.tasksOf(b.number).length - this.tasksOf(a.number).length);
  }

  descendants(n: number, seen = new Set<number>()): Issue[] {
    const out: Issue[] = [];
    for (const k of this.kids.get(n) ?? []) {
      if (seen.has(k.number)) continue;
      seen.add(k.number);
      out.push(k, ...this.descendants(k.number, seen));
    }
    return out;
  }

  /** Les tâches d'un chantier, sans les sous-chantiers. */
  tasksOf(epic: number): Issue[] {
    return this.descendants(epic).filter((i) => i.type !== "Epic");
  }

  epicOf(i: Issue): Issue | null {
    let cur: Issue | undefined = i;
    for (let guard = 0; cur?.parent && guard < 10; guard++) {
      cur = this.byNum.get(cur.parent);
      if (cur?.type === "Epic") return cur;
    }
    return null;
  }

  inMilestone(m: number): Issue[] {
    return this.data.issues.filter((i) => i.milestone === m);
  }

  /** Le jalon qu'on met en avant : le MVP s'il existe, sinon le premier ouvert. */
  currentMilestone(): Milestone | null {
    const open = this.data.milestones.filter((m) => m.state === "OPEN");
    return open.find((m) => /mvp/i.test(m.title)) ?? open[0] ?? null;
  }

  currentIteration(now: Date): { it: Iteration; start: Date; end: Date } | null {
    for (const it of this.data.iterations) {
      const start = new Date(`${it.startDate}T00:00:00`);
      const stop = new Date(start.getTime() + it.duration * DAY);
      if (now >= start && now < stop) return { it, start, end: new Date(stop.getTime() - DAY) };
    }
    return null;
  }

  /** Les chantiers, plus « Hors chantier » pour ce qui n'est rangé nulle part. */
  groups(): { epic: Issue | null; name: string; items: Issue[] }[] {
    const gs = this.epics.map((e) => ({ epic: e as Issue | null, name: cleanEpic(e.title), items: this.tasksOf(e.number) }));
    const loose = this.work.filter((i) => !this.epicOf(i));
    if (loose.length) gs.push({ epic: null, name: "Hors chantier", items: loose });
    return gs;
  }

  openPullFor(i: Issue): Pull | undefined {
    return this.data.pulls.find((p) => p.state === "OPEN" && p.closes.includes(i.number));
  }

  /** Ce que la fin d'une tâche fait gagner : au jalon, au chantier, aux tâches qu'elle bloque. */
  impact(i: Issue): { milestone?: { title: string; from: number; to: number }; epic?: { title: string; from: number; to: number }; unblocks: number } | null {
    if (statusOf(i) === "Done" || i.type === "Epic") return null;
    const out: ReturnType<Project["impact"]> = { unblocks: (this.frees.get(i.number) ?? []).filter((x) => statusOf(x) !== "Done").length };
    const m = this.data.milestones.find((x) => x.number === i.milestone);
    if (m) {
      const l = this.inMilestone(m.number);
      out.milestone = { title: m.title, from: pct(done(l), l.length), to: pct(done(l) + 1, l.length) };
    }
    const e = this.epicOf(i);
    if (e) {
      const l = this.tasksOf(e.number);
      out.epic = { title: cleanEpic(e.title), from: pct(done(l), l.length), to: pct(done(l) + 1, l.length) };
    }
    return out;
  }

  /** Courbe jour par jour : tâches prévues (créées) et faites (fermées), jusqu'à `now`. */
  burnup(list: Issue[], now: Date): { day: Date; scope: number; done: number }[] {
    if (!list.length) return [];
    const start = new Date(Math.min(...list.map((i) => +new Date(i.createdAt))));
    start.setHours(0, 0, 0, 0);
    const out: { day: Date; scope: number; done: number }[] = [];
    for (let d = start; d <= now; d = new Date(d.getTime() + DAY)) out.push(this.pointAt(list, d));
    out.push(this.pointAt(list, now));
    return out;
  }

  private pointAt(list: Issue[], d: Date) {
    return {
      day: d,
      scope: list.filter((i) => new Date(i.createdAt) <= d).length,
      done: list.filter((i) => i.closedAt && new Date(i.closedAt) <= d).length,
    };
  }

  /** Ce qui a bougé depuis `since` : tâches finies, code intégré, code proposé. */
  feed(since: Date): { at: string; kind: StatusKey; what: string; title: string; url: string; who?: string }[] {
    const ev: ReturnType<Project["feed"]> = [];
    for (const i of this.data.issues)
      if (i.closedAt && new Date(i.closedAt) > since) ev.push({ at: i.closedAt, kind: "Done", what: "Tâche finie", title: `#${i.number} ${i.title}`, url: i.url });
    for (const p of this.data.pulls) {
      if (p.mergedAt && new Date(p.mergedAt) > since) ev.push({ at: p.mergedAt, kind: "In review", what: "Code intégré", title: p.title, url: p.url, who: p.author ?? undefined });
      if (p.state === "OPEN") ev.push({ at: p.createdAt, kind: "In progress", what: "Code proposé, en relecture", title: p.title, url: p.url, who: p.author ?? undefined });
    }
    return ev.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }
}
