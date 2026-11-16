#!/usr/bin/env python3
"""Photo de l'avancement de Rescue Atlas, lue sur GitHub, écrite dans data.json.

Lit le dépôt public et le tableau d'organisation 44 (statut, taille, itération).
Usage : python3 snapshot.py [data.json]
Demande `gh` connecté, ou la variable GH_TOKEN (dans une GitHub Action).
"""

import json
import subprocess
import sys
from datetime import UTC, datetime

OWNER, NAME, PROJECT = "dataforgoodfr", "mediterranean-rescue", 44

QUERY = """
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, states: [OPEN, CLOSED]) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state stateReason createdAt closedAt updatedAt
        issueType { name }
        milestone { number }
        parent { number }
        labels(first: 20) { nodes { name } }
        assignees(first: 10) { nodes { login avatarUrl } }
        blockedBy(first: 20) { nodes { number } }
        subIssuesSummary { total completed }
        projectItems(first: 5) {
          nodes {
            project { number }
            status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            size: fieldValueByName(name: "Size") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            iteration: fieldValueByName(name: "Iteration") { ... on ProjectV2ItemFieldIterationValue { title } }
          }
        }
      }
    }
  }
}
"""

QUERY_REST = """
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    milestones(first: 20, orderBy: {field: DUE_DATE, direction: ASC}) {
      nodes { number title dueOn state description }
    }
    pullRequests(last: 60) {
      nodes {
        number title url state createdAt mergedAt
        author { login }
        closingIssuesReferences(first: 5) { nodes { number } }
      }
    }
  }
}
"""

QUERY_ITERATIONS = """
query($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      field(name: "Iteration") {
        ... on ProjectV2IterationField {
          configuration {
            iterations { title startDate duration }
            completedIterations { title startDate duration }
          }
        }
      }
    }
  }
}
"""


def graphql(query: str, **variables: str | None) -> dict:
    args = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        if isinstance(value, int):
            args += ["-F", f"{key}={value}"]
        elif value is not None:
            args += ["-f", f"{key}={value}"]
    sortie = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    return json.loads(sortie)["data"]


def statut(issue: dict) -> str | None:
    """Le statut du tableau 44, ou None si l'issue n'y est pas."""
    for item in issue["projectItems"]["nodes"]:
        if item["project"]["number"] == PROJECT:
            return (item.get("status") or {}).get("name")
    return None


def champ(issue: dict, nom: str) -> str | None:
    for item in issue["projectItems"]["nodes"]:
        if item["project"]["number"] == PROJECT:
            valeur = item.get(nom) or {}
            return valeur.get("name") or valeur.get("title")
    return None


def main() -> None:
    sortie = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    issues, after = [], None
    while True:
        page = graphql(QUERY, owner=OWNER, name=NAME, after=after)["repository"]["issues"]
        issues += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    reste = graphql(QUERY_REST, owner=OWNER, name=NAME)["repository"]
    config = graphql(QUERY_ITERATIONS, owner=OWNER, number=PROJECT)["organization"]["projectV2"]["field"]["configuration"]

    data = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "repo": f"https://github.com/{OWNER}/{NAME}",
        "project": f"https://github.com/orgs/{OWNER}/projects/{PROJECT}",
        "milestones": [
            {k: m[k] for k in ("number", "title", "dueOn", "state", "description")}
            for m in reste["milestones"]["nodes"]
        ],
        "iterations": config["completedIterations"] + config["iterations"],
        "issues": [
            {
                "number": i["number"],
                "title": i["title"],
                "url": i["url"],
                "state": i["state"],
                "stateReason": i["stateReason"],
                "type": (i.get("issueType") or {}).get("name"),
                "status": "Done" if i["state"] == "CLOSED" else statut(i),
                "size": champ(i, "size"),
                "iteration": champ(i, "iteration"),
                "milestone": (i.get("milestone") or {}).get("number"),
                "parent": (i.get("parent") or {}).get("number"),
                "labels": [label["name"] for label in i["labels"]["nodes"]],
                "assignees": [{"login": a["login"], "avatar": a["avatarUrl"]} for a in i["assignees"]["nodes"]],
                "blockedBy": [b["number"] for b in i["blockedBy"]["nodes"]],
                "subs": i["subIssuesSummary"],
                "createdAt": i["createdAt"],
                "closedAt": i["closedAt"],
                "updatedAt": i["updatedAt"],
            }
            for i in issues
            # une issue fermée comme « pas prévue » n'est plus du travail à faire
            if i["stateReason"] != "NOT_PLANNED"
        ],
        "pulls": [
            {
                "number": p["number"],
                "title": p["title"],
                "url": p["url"],
                "state": p["state"],
                "createdAt": p["createdAt"],
                "mergedAt": p["mergedAt"],
                "author": (p.get("author") or {}).get("login"),
                "closes": [c["number"] for c in p["closingIssuesReferences"]["nodes"]],
            }
            for p in reste["pullRequests"]["nodes"]
        ],
    }
    with open(sortie, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{sortie} : {len(data['issues'])} issues, {len(data['pulls'])} PR, {len(data['milestones'])} jalons")


if __name__ == "__main__":
    main()
