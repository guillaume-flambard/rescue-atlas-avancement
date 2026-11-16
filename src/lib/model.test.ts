import { describe, expect, it } from "vitest";
import { Project, counts, dueDay, statusOf, type Issue, type Snapshot } from "./model";

// Données FICTIF : un petit projet inventé, pas celui de SOS.
const base: Omit<Issue, "number" | "title"> = {
  url: "https://example.org", state: "OPEN", stateReason: null, type: "Task", status: "Refinement", size: null,
  iteration: null, milestone: null, parent: null, labels: [], assignees: [], blockedBy: [], subs: null,
  createdAt: "2026-11-01T10:00:00Z", closedAt: null, updatedAt: "2026-11-01T10:00:00Z",
};
const issue = (number: number, extra: Partial<Issue> = {}): Issue => ({ ...base, number, title: `FICTIF ${number}`, ...extra });

const snap: Snapshot = {
  generated_at: "2026-11-16T19:00:00Z",
  repo: "", project: "",
  milestones: [
    { number: 1, title: "P1", dueOn: "2026-12-31T00:00:00Z", state: "OPEN", description: null },
    { number: 2, title: "P0 · MVP", dueOn: "2026-11-30T00:00:00Z", state: "OPEN", description: null },
  ],
  iterations: [{ title: "Iteration 1", startDate: "2026-11-16", duration: 12 }],
  issues: [
    issue(1, { type: "Epic" }),
    issue(2, { parent: 1, milestone: 2, state: "CLOSED", status: "Done", closedAt: "2026-11-10T09:00:00Z" }),
    issue(3, { parent: 1, milestone: 2, status: "In progress" }),
    issue(4, { parent: 3, milestone: 2, status: "Ready", blockedBy: [3] }),
    issue(5, { status: null }),
    issue(6, { type: "Epic", parent: 1 }),
  ],
  pulls: [{ number: 9, title: "feat", url: "", state: "OPEN", createdAt: "2026-11-15T10:00:00Z", mergedAt: null, author: "x", closes: [3] }],
};
const p = new Project(snap);

describe("statuts", () => {
  it("une issue fermée est faite, quel que soit le tableau", () => {
    expect(statusOf(issue(7, { state: "CLOSED", status: "Ready" }))).toBe("Done");
  });
  it("une issue absente du tableau est « hors tableau »", () => {
    expect(statusOf(issue(8, { status: null }))).toBe("none");
  });
  it("compte par colonne", () => {
    expect(counts(snap.issues.filter((i) => i.type !== "Epic"))).toMatchObject({ Done: 1, "In progress": 1, Ready: 1, none: 1 });
  });
});

describe("hiérarchie", () => {
  it("les tâches d'un chantier incluent les petites-filles, pas les sous-chantiers", () => {
    expect(p.tasksOf(1).map((i) => i.number).sort()).toEqual([2, 3, 4]);
  });
  it("retrouve le chantier d'une petite-fille", () => {
    expect(p.epicOf(p.byNum.get(4)!)?.number).toBe(1);
  });
  it("classe les chantiers du plus gros au plus petit", () => {
    expect(p.epics.map((e) => e.number)).toEqual([1]);
    const two = new Project({ ...snap, issues: [...snap.issues, issue(10, { type: "Epic" }), issue(11, { parent: 10 }), issue(12, { parent: 10 }), issue(13, { parent: 10 }), issue(14, { parent: 10 })] });
    expect(two.epics.map((e) => e.number)).toEqual([10, 1]);
  });
  it("met ce qui n'a pas de chantier dans « Hors chantier »", () => {
    expect(p.groups().at(-1)).toMatchObject({ name: "Hors chantier" });
    expect(p.groups().at(-1)!.items.map((i) => i.number)).toEqual([5]);
  });
});

describe("objectifs", () => {
  it("met le MVP en avant même s'il n'est pas le premier jalon", () => {
    expect(p.currentMilestone()?.title).toBe("P0 · MVP");
  });
  it("lit la date d'un jalon comme un jour", () => {
    expect(dueDay("2026-11-30T00:00:00Z").getDate()).toBe(30);
  });
  it("trouve le sprint du jour", () => {
    expect(p.currentIteration(new Date("2026-11-20T12:00:00"))?.it.title).toBe("Iteration 1");
    expect(p.currentIteration(new Date("2026-12-20T12:00:00"))).toBeNull();
  });
});

describe("ce qu'une tâche fait gagner", () => {
  it("donne le gain au jalon et au chantier, et les tâches débloquées", () => {
    expect(p.impact(p.byNum.get(3)!)).toEqual({
      unblocks: 1,
      milestone: { title: "P0 · MVP", from: 33, to: 67 },
      epic: { title: "FICTIF 1", from: 33, to: 67 },
    });
  });
  it("ne dit rien pour une tâche déjà faite", () => {
    expect(p.impact(p.byNum.get(2)!)).toBeNull();
  });
  it("relie une PR ouverte à la tâche qu'elle ferme", () => {
    expect(p.openPullFor(p.byNum.get(3)!)?.number).toBe(9);
  });
});

describe("progression", () => {
  it("la courbe monte avec les tâches fermées", () => {
    const list = p.inMilestone(2);
    const pts = p.burnup(list, new Date("2026-11-16T12:00:00Z"));
    expect(pts[0]).toMatchObject({ scope: 0, done: 0 });
    expect(pts.at(-1)).toMatchObject({ scope: 3, done: 1 });
  });
  it("le fil de la semaine met le plus récent en premier", () => {
    const f = p.feed(new Date("2026-11-09T00:00:00Z"));
    expect(f.map((e) => e.what)).toEqual(["Code proposé, en relecture", "Tâche finie"]);
  });
});
