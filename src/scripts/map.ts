// La carte côté navigateur : la fiche d'une tâche, les filtres, et la bascule 3D / liste.
// La scène Three.js est chargée seulement quand on l'affiche (import dynamique).
import { Project, STATUS, cleanEpic, statusOf, type Issue, type Snapshot } from "../lib/model";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function setupMap() {
  const root = document.getElementById("map")!;
  const project = new Project(JSON.parse(document.getElementById("atlas-data")!.textContent!) as Snapshot);
  const milestone = Number(root.dataset.milestone) || null;
  const sprint = root.dataset.sprint || null;
  const panel = document.getElementById("panel")!;
  const graphEl = document.getElementById("graph")!;
  const body = document.getElementById("map-body")!;
  const tree = document.getElementById("tree")!;
  let focus = "all";
  let view: "3d" | "list" | null = null;
  let scene: { setFocus(): void; destroy(): void } | null = null;

  const inFocus = (i: Issue) =>
    focus === "all" || (focus === "ms" && i.milestone === milestone) || (focus === "sprint" && !!sprint && i.iteration === sprint);

  function openPanel(i: Issue | null) {
    if (!i) { panel.classList.remove("open"); return; }
    const s = STATUS[statusOf(i)];
    const epic = project.epicOf(i);
    const m = project.data.milestones.find((x) => x.number === i.milestone);
    const waits = i.blockedBy.map((n) => project.byNum.get(n)).filter((x): x is Issue => !!x);
    const frees = project.frees.get(i.number) ?? [];
    const pr = project.openPullFor(i);
    const imp = project.impact(i);
    const gains = imp ? [
      imp.milestone && `${esc(imp.milestone.title)} passe de ${imp.milestone.from} % à ${imp.milestone.to} %`,
      imp.epic && `le chantier ${esc(imp.epic.title)} passe de ${imp.epic.from} % à ${imp.epic.to} %`,
      imp.unblocks && `${imp.unblocks} tâche${imp.unblocks > 1 ? "s se débloquent" : " se débloque"}`,
    ].filter(Boolean) : [];
    const isEpic = i.type === "Epic";
    const tasks = isEpic ? project.tasksOf(i.number) : [];
    panel.style.setProperty("--c", isEpic ? "#1B2747" : s.hex);
    panel.style.setProperty("--c-text", isEpic ? "#1B2747" : s.text);
    panel.innerHTML = `<button class="close" type="button" aria-label="Fermer">×</button>
      <span class="num">#${i.number} · ${isEpic ? "Chantier" : "Tâche"}</span>
      <h3>${esc(cleanEpic(i.title))}</h3>
      <p class="stword">${isEpic ? `${tasks.filter((t) => statusOf(t) === "Done").length} sur ${tasks.length} tâches faites` : s.label}${pr ? ", code proposé en relecture" : ""}</p>
      <dl>
        ${epic ? `<dt>Chantier</dt><dd>${esc(cleanEpic(epic.title))}</dd>` : ""}
        ${m ? `<dt>Objectif</dt><dd>${esc(m.title)}</dd>` : ""}
        ${i.iteration ? `<dt>Sprint</dt><dd>${esc(i.iteration.replace("Iteration", "Itération"))}</dd>` : ""}
        ${i.size ? `<dt>Taille</dt><dd>${esc(i.size)}</dd>` : ""}
        ${isEpic ? "" : `<dt>Avec</dt><dd>${i.assignees.length ? i.assignees.map((a) => esc(a.login)).join(", ") : "personne pour l'instant"}</dd>`}
      </dl>
      ${gains.length ? `<p class="impact"><b>Quand elle sera faite :</b> ${gains.join(", ")}.</p>` : ""}
      ${waits.length ? `<h4>Elle attend</h4><ul>${waits.map((w) => `<li>#${w.number} ${esc(w.title)} (${STATUS[statusOf(w)].label.toLowerCase()})</li>`).join("")}</ul>` : ""}
      ${frees.length ? `<h4>Elle débloque</h4><ul>${frees.map((w) => `<li>#${w.number} ${esc(w.title)}</li>`).join("")}</ul>` : ""}
      <a class="btn-gh" href="${esc(i.url)}">Ouvrir sur GitHub</a>`;
    panel.classList.add("open");
    panel.querySelector(".close")!.addEventListener("click", () => openPanel(null));
  }

  function filterList() {
    for (const row of tree.querySelectorAll<HTMLElement>("[data-ms]")) {
      const ok = focus === "all" || (focus === "ms" && Number(row.dataset.ms) === milestone) || (focus === "sprint" && row.dataset.it === sprint);
      row.style.display = ok ? "" : "none";
    }
  }

  async function show(v: "3d" | "list") {
    view = v;
    for (const b of document.querySelectorAll<HTMLElement>("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === v));
    openPanel(null);
    scene?.destroy();
    scene = null;
    if (v === "list") { body.hidden = true; tree.hidden = false; filterList(); return; }
    body.hidden = false; tree.hidden = true;
    graphEl.innerHTML = `<div class="loading-map">Préparation de la carte…</div>`;
    let mod: typeof import("./scene");
    try { mod = await import("./scene"); } catch {
      graphEl.innerHTML = `<div class="loading-map">La 3D n'a pas pu se charger. La vue Liste montre les mêmes tâches.</div>`;
      return;
    }
    if (view !== v) return;
    graphEl.innerHTML = "";
    scene = mod.mount(graphEl, {
      project,
      milestone,
      inFocus,
      reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      onOpen: openPanel,
    });
    const deep = location.hash.match(/^#tache-(\d+)$/);
    if (deep) openPanel(project.byNum.get(Number(deep[1])) ?? null);
  }

  for (const b of document.querySelectorAll<HTMLElement>("[data-view]")) b.addEventListener("click", () => show(b.dataset.view as "3d" | "list"));
  for (const b of document.querySelectorAll<HTMLElement>("[data-focus]")) b.addEventListener("click", () => {
    focus = b.dataset.focus!;
    for (const x of document.querySelectorAll<HTMLElement>("[data-focus]")) x.setAttribute("aria-pressed", String(x === b));
    if (view === "list") filterList(); else scene?.setFocus();
  });

  // Téléphone : la liste d'abord. Écran large : la 3D, chargée quand on approche de la carte.
  if (innerWidth < 720) { show("list"); return; }
  let started = false;
  const go = () => { if (!started) { started = true; io.disconnect(); show("3d"); } };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) go(); }, { rootMargin: "400px" });
  io.observe(body);
  setTimeout(go, 3000);
}
