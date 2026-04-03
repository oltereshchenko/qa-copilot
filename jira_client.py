import os
import re
import requests
from requests.auth import HTTPBasicAuth


def _auth():
    email = os.getenv("JIRA_EMAIL")
    token = os.getenv("JIRA_API_TOKEN")
    if not email or not token:
        raise ValueError("JIRA_EMAIL and JIRA_API_TOKEN must be set in .env")
    return HTTPBasicAuth(email, token)


def _base_url():
    url = os.getenv("JIRA_BASE_URL", "").rstrip("/")
    if not url:
        raise ValueError("JIRA_BASE_URL must be set in .env")
    return url


def _adf_to_text(node):
    """Recursively convert Atlassian Document Format to markdown."""
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""

    node_type = node.get("type", "")
    text = node.get("text", "")
    content = node.get("content", [])
    marks = node.get("marks", [])

    if node_type == "table":
        return _adf_table_to_markdown(node)

    parts = []

    if text:
        marked_text = text
        for mark in marks:
            mt = mark.get("type", "")
            if mt == "strong":
                marked_text = f"**{marked_text}**"
            elif mt == "em":
                marked_text = f"*{marked_text}*"
            elif mt == "code":
                marked_text = f"`{marked_text}`"
            elif mt == "strike":
                marked_text = f"~~{marked_text}~~"
        parts.append(marked_text)

    for child in content:
        parts.append(_adf_to_text(child))

    joined = "".join(parts)

    if node_type in ("paragraph", "heading"):
        level = node.get("attrs", {}).get("level", 2)
        if node_type == "heading":
            joined = f"{'#' * level} {joined}"
        return joined + "\n\n"
    elif node_type == "bulletList":
        return joined + "\n"
    elif node_type == "orderedList":
        return joined + "\n"
    elif node_type == "listItem":
        return f"- {joined.strip()}\n"
    elif node_type == "codeBlock":
        return f"```\n{joined}\n```\n\n"
    elif node_type == "blockquote":
        lines = joined.strip().split("\n")
        return "\n".join(f"> {line}" for line in lines) + "\n\n"
    elif node_type == "rule":
        return "---\n\n"
    elif node_type == "hardBreak":
        return "\n"

    return joined


def _adf_table_to_markdown(table_node):
    """Convert ADF table node to markdown table."""
    rows = []
    for row_node in table_node.get("content", []):
        if row_node.get("type") != "tableRow":
            continue
        cells = []
        for cell_node in row_node.get("content", []):
            cell_text = ""
            for child in cell_node.get("content", []):
                cell_text += _adf_to_text(child)
            cell_text = cell_text.strip().replace("\n\n", " ").replace("\n", " ")
            cells.append(cell_text)
        rows.append(cells)

    if not rows:
        return ""

    max_cols = max(len(r) for r in rows)
    for row in rows:
        while len(row) < max_cols:
            row.append("")

    col_widths = []
    for col_idx in range(max_cols):
        width = max(len(row[col_idx]) for row in rows)
        col_widths.append(max(width, 3))

    lines = []
    for row_idx, row in enumerate(rows):
        cells_formatted = []
        for col_idx, cell in enumerate(row):
            cells_formatted.append(cell.ljust(col_widths[col_idx]))
        lines.append("| " + " | ".join(cells_formatted) + " |")

        if row_idx == 0:
            sep = []
            for w in col_widths:
                sep.append("-" * w)
            lines.append("| " + " | ".join(sep) + " |")

    return "\n".join(lines) + "\n\n"


def fetch_issue(issue_key):
    """Fetch a Jira issue and return structured text."""
    issue_key = issue_key.strip().upper()
    if not re.match(r"^[A-Z][A-Z0-9]+-\d+$", issue_key):
        raise ValueError(f"Invalid issue key format: {issue_key}")

    url = f"{_base_url()}/rest/api/3/issue/{issue_key}"
    resp = requests.get(url, auth=_auth(), headers={"Accept": "application/json"}, timeout=10)

    if resp.status_code == 404:
        raise ValueError(f"Issue {issue_key} not found")
    resp.raise_for_status()

    data = resp.json()
    fields = data.get("fields", {})

    summary = fields.get("summary", "No summary")
    status = fields.get("status", {}).get("name", "Unknown")
    priority = fields.get("priority", {}).get("name", "Unknown") if fields.get("priority") else "None"
    issue_type = fields.get("issuetype", {}).get("name", "Unknown")
    labels = ", ".join(fields.get("labels", [])) or "None"
    assignee = fields.get("assignee", {}).get("displayName", "Unassigned") if fields.get("assignee") else "Unassigned"

    description_adf = fields.get("description")
    if description_adf and isinstance(description_adf, dict):
        description = _adf_to_text(description_adf).strip()
    elif isinstance(description_adf, str):
        description = description_adf
    else:
        description = "No description provided."

    acceptance = ""
    if "customfield_10035" in fields and fields["customfield_10035"]:
        ac_field = fields["customfield_10035"]
        if isinstance(ac_field, dict):
            acceptance = _adf_to_text(ac_field).strip()
        elif isinstance(ac_field, str):
            acceptance = ac_field

    output = f"""## {issue_key}: {summary}

**Type:** {issue_type}
**Status:** {status}
**Priority:** {priority}
**Assignee:** {assignee}
**Labels:** {labels}

### Description
{description}"""

    if acceptance:
        output += f"\n\n### Acceptance Criteria\n{acceptance}"

    return output


def get_create_meta(project_key="ENG"):
    """Fetch feature teams and labels for issue creation."""
    meta_url = (
        f"{_base_url()}/rest/api/3/issue/createmeta"
        f"?projectKeys={project_key}&issuetypeNames=Defect"
        f"&expand=projects.issuetypes.fields"
    )
    resp = requests.get(
        meta_url, auth=_auth(),
        headers={"Accept": "application/json"}, timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    feature_teams = []
    projects = data.get("projects", [])
    if projects:
        issue_types = projects[0].get("issuetypes", [])
        if issue_types:
            ft_field = issue_types[0].get("fields", {}).get("customfield_10116", {})
            for v in ft_field.get("allowedValues", []):
                feature_teams.append({"id": v["id"], "value": v["value"]})

    labels_url = f"{_base_url()}/rest/api/1.0/labels/suggest?query="
    labels_resp = requests.get(
        labels_url, auth=_auth(),
        headers={"Accept": "application/json"}, timeout=10,
    )
    labels = []
    if labels_resp.ok:
        for s in labels_resp.json().get("suggestions", []):
            labels.append(s["label"])

    return {"feature_teams": feature_teams, "labels": labels}


def _line_to_adf_content(line):
    """Parse a line with *bold* markers into ADF inline nodes."""
    parts = re.split(r'(\*[^*]+\*)', line)
    nodes = []
    for part in parts:
        if not part:
            continue
        if part.startswith('*') and part.endswith('*') and len(part) > 2:
            nodes.append({
                "type": "text",
                "text": part[1:-1],
                "marks": [{"type": "strong"}],
            })
        else:
            nodes.append({"type": "text", "text": part})
    return nodes or [{"type": "text", "text": line}]


def create_issue(project_key, summary, description, issue_type="Defect",
                 feature_teams=None, labels=None):
    """Create a new Jira issue and return the key + URL."""
    url = f"{_base_url()}/rest/api/3/issue"

    description_adf = {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": _line_to_adf_content(line),
            }
            for line in description.split("\n") if line.strip()
        ]
    }

    fields = {
        "project": {"key": project_key.upper()},
        "summary": summary,
        "description": description_adf,
        "issuetype": {"name": issue_type},
    }

    if labels:
        fields["labels"] = labels

    if feature_teams:
        fields["customfield_10116"] = [{"id": str(t)} for t in feature_teams]

    payload = {"fields": fields}

    resp = requests.post(
        url,
        json=payload,
        auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()

    data = resp.json()
    new_key = data["key"]
    issue_url = f"{_base_url()}/browse/{new_key}"

    return {"key": new_key, "url": issue_url}


def add_comment(issue_key, body):
    """Add a comment to an existing Jira issue."""
    issue_key = issue_key.strip().upper()
    url = f"{_base_url()}/rest/api/3/issue/{issue_key}/comment"

    comment_adf = {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": _line_to_adf_content(line) if line.strip() else [{"type": "text", "text": " "}],
            }
            for line in body.split("\n")
        ],
    }

    payload = {"body": comment_adf}

    resp = requests.post(
        url,
        json=payload,
        auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()

    return {"issue_key": issue_key, "url": f"{_base_url()}/browse/{issue_key}"}


def _get_boards_for_projects(project_keys):
    """Try to find board names for given project keys via Agile API."""
    boards = {}
    for pk in project_keys:
        try:
            url = f"{_base_url()}/rest/agile/1.0/board"
            resp = requests.get(
                url, params={"projectKeyOrId": pk, "maxResults": 1},
                auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
            )
            if resp.status_code == 200:
                vals = resp.json().get("values", [])
                if vals:
                    boards[pk] = vals[0].get("name", pk)
        except Exception:
            pass
    return boards


def get_board_issues(username, board_id=18):
    """Fetch open issues assigned to a user from a specific Jira board."""
    account_id = _resolve_account_id(username)
    jql = (
        f'assignee = "{account_id}" '
        f'AND statusCategory != "Done" '
        f'ORDER BY priority DESC, updated DESC'
    )
    url = f"{_base_url()}/rest/agile/1.0/board/{board_id}/issue"
    resp = requests.get(
        url,
        params={"jql": jql, "maxResults": 30, "fields": "summary,status,issuetype,priority,updated,project"},
        auth=_auth(),
        headers={"Accept": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    base = _base_url()
    issues = []
    for item in data.get("issues", []):
        f = item.get("fields", {})
        proj = f.get("project", {})
        issues.append({
            "key": item["key"],
            "summary": f.get("summary", ""),
            "status": f.get("status", {}).get("name", "") if f.get("status") else "",
            "type": f.get("issuetype", {}).get("name", "") if f.get("issuetype") else "",
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "updated": f.get("updated", ""),
            "url": f"{base}/browse/{item['key']}",
            "project": proj.get("key", ""),
            "projectName": proj.get("name", ""),
        })

    return {"total": data.get("total", len(issues)), "issues": issues}


def get_active_sprint(board_id=16):
    """Fetch the active sprint for a board."""
    url = f"{_base_url()}/rest/agile/1.0/board/{board_id}/sprint"
    resp = requests.get(
        url, params={"state": "active", "maxResults": 1},
        auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
    )
    resp.raise_for_status()
    sprints = resp.json().get("values", [])
    if not sprints:
        return None
    s = sprints[0]
    return {
        "id": s.get("id"),
        "name": s.get("name", ""),
        "startDate": s.get("startDate", ""),
        "endDate": s.get("endDate", ""),
        "goal": s.get("goal", ""),
    }


def get_sprint_progress(sprint_id, board_id=16):
    """Get issue counts for a sprint."""
    url = f"{_base_url()}/rest/agile/1.0/board/{board_id}/sprint/{sprint_id}/issue"
    resp = requests.get(
        url, params={"maxResults": 0, "fields": "status"},
        auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
    )
    resp.raise_for_status()
    total = resp.json().get("total", 0)

    resp2 = requests.get(
        url, params={"maxResults": 200, "fields": "status"},
        auth=_auth(), headers={"Accept": "application/json"}, timeout=15,
    )
    resp2.raise_for_status()
    issues = resp2.json().get("issues", [])

    done = sum(1 for i in issues
               if i.get("fields", {}).get("status", {}).get("statusCategory", {}).get("key") == "done")

    return {"total": total, "done": done}


def search_issues(query, max_results=8):
    """Search Jira issues by text or key."""
    if re.match(r'^[A-Z]+-\d+$', query.strip().upper()):
        jql = f'key = "{query.strip().upper()}"'
    else:
        jql = f'text ~ "{query}" ORDER BY updated DESC'

    url = f"{_base_url()}/rest/api/3/search/jql"
    payload = {
        "jql": jql,
        "maxResults": max_results,
        "fields": ["summary", "status", "issuetype", "assignee"],
    }
    resp = requests.post(
        url, json=payload, auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    base = _base_url()
    results = []
    for item in resp.json().get("issues", []):
        f = item.get("fields", {})
        results.append({
            "key": item["key"],
            "summary": f.get("summary", ""),
            "status": f.get("status", {}).get("name", "") if f.get("status") else "",
            "type": f.get("issuetype", {}).get("name", "") if f.get("issuetype") else "",
            "url": f"{base}/browse/{item['key']}",
        })
    return results


def get_my_issues(username):
    """Fetch open issues assigned to a user with project/board info."""
    account_id = _resolve_account_id(username)
    jql = (
        f'assignee = "{account_id}" '
        f'AND statusCategory != "Done" '
        f'ORDER BY priority DESC, updated DESC'
    )
    url = f"{_base_url()}/rest/api/3/search/jql"
    payload = {
        "jql": jql,
        "maxResults": 50,
        "fields": ["summary", "status", "issuetype", "priority", "updated", "project"],
    }
    resp = requests.post(
        url, json=payload, auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    base = _base_url()
    project_keys = set()
    issues = []
    for item in data.get("issues", []):
        f = item.get("fields", {})
        proj = f.get("project", {})
        pk = proj.get("key", "")
        project_keys.add(pk)
        issues.append({
            "key": item["key"],
            "summary": f.get("summary", ""),
            "status": f.get("status", {}).get("name", "") if f.get("status") else "",
            "statusCategory": f.get("status", {}).get("statusCategory", {}).get("name", "") if f.get("status") else "",
            "type": f.get("issuetype", {}).get("name", "") if f.get("issuetype") else "",
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "updated": f.get("updated", ""),
            "url": f"{base}/browse/{item['key']}",
            "project": pk,
            "projectName": proj.get("name", pk),
        })

    boards = _get_boards_for_projects(project_keys)

    return {
        "total": data.get("total", len(issues)),
        "issues": issues,
        "boards": boards,
    }


def _resolve_account_id(username):
    """Resolve a username/email/displayName to a Jira accountId."""
    url = f"{_base_url()}/rest/api/3/user/search"
    resp = requests.get(
        url, params={"query": username, "maxResults": 1},
        auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
    )
    resp.raise_for_status()
    users = resp.json()
    if not users:
        raise ValueError(f"Jira user not found: {username}")
    return users[0]["accountId"]


def get_user_activity(username, date_str):
    """Fetch issues updated by a user on a given date."""
    from datetime import datetime, timedelta

    account_id = _resolve_account_id(username)

    next_date = (
        datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    jql = (
        f'(assignee = "{account_id}" OR reporter = "{account_id}") '
        f'AND updated >= "{date_str}" AND updated < "{next_date}" '
        f'ORDER BY updated DESC'
    )
    url = f"{_base_url()}/rest/api/3/search/jql"
    payload = {
        "jql": jql,
        "maxResults": 50,
        "fields": ["summary", "status", "issuetype", "priority", "labels", "updated", "created"],
    }

    resp = requests.post(
        url, json=payload, auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    all_issues = data.get("issues", [])

    while not data.get("isLast", True) and data.get("nextPageToken"):
        payload["nextPageToken"] = data["nextPageToken"]
        resp = requests.post(
            url, json=payload, auth=_auth(),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        all_issues.extend(data.get("issues", []))

    issues = []
    for item in all_issues:
        f = item.get("fields", {})
        created = f.get("created", "")[:10]
        issues.append({
            "key": item["key"],
            "summary": f.get("summary", ""),
            "status": f.get("status", {}).get("name", ""),
            "type": f.get("issuetype", {}).get("name", ""),
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "labels": f.get("labels", []),
            "created_today": created == date_str,
        })

    return issues


def attach_files(issue_key, file_paths):
    files_data = []
    for path in file_paths:
        fname = os.path.basename(path)
        files_data.append(("file", (fname, open(path, "rb"))))

    url = f"{_base_url()}/rest/api/3/issue/{issue_key}/attachments"
    resp = requests.post(
        url,
        headers={"X-Atlassian-Token": "no-check"},
        auth=_auth(),
        files=files_data,
    )
    for _, (_, fobj) in files_data:
        fobj.close()
    resp.raise_for_status()
    return resp.json()


def _parse_jira_dt(ts):
    """Parse Jira ISO timestamp with timezone (handles +0300 format)."""
    from datetime import datetime, timezone
    ts = re.sub(r'([+-])(\d{2})(\d{2})$', r'\1\2:\3', ts)
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_changelog_events(issue_key, account_id, since_dt):
    """Fetch recent changelog entries and return status/assignee change events."""
    events = []
    try:
        cl_url = f"{_base_url()}/rest/api/3/issue/{issue_key}/changelog"
        resp = requests.get(
            cl_url, params={"maxResults": 0},
            auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
        )
        if not resp.ok:
            return events
        total = resp.json().get("total", 0)
        if total == 0:
            return events

        start_at = max(0, total - 15)
        resp2 = requests.get(
            cl_url, params={"startAt": start_at, "maxResults": 15},
            auth=_auth(), headers={"Accept": "application/json"}, timeout=10,
        )
        if not resp2.ok:
            return events

        for history in resp2.json().get("values", []):
            created = history.get("created", "")
            try:
                change_time = _parse_jira_dt(created)
                if change_time < since_dt:
                    continue
            except Exception:
                continue

            author = history.get("author", {})
            if author.get("accountId") == account_id:
                continue

            author_name = author.get("displayName", "Someone")
            for ci in history.get("items", []):
                field = ci.get("field", "")
                if field == "status":
                    events.append({
                        "kind": "status",
                        "text": f"{author_name}: {ci.get('fromString', '')} → {ci.get('toString', '')}",
                    })
                elif field == "assignee":
                    events.append({
                        "kind": "assigned",
                        "text": f"{author_name} assigned to {ci.get('toString', 'you')}",
                    })
    except Exception:
        pass
    return events


def _get_comment_events(comment_field, account_id, since_dt):
    """Extract recent comment/mention events."""
    events = []
    comments = comment_field.get("comments", [])
    for c in comments[-5:]:
        c_created = c.get("created", c.get("updated", ""))
        author = c.get("author", {})
        if author.get("accountId") == account_id:
            continue
        try:
            c_time = _parse_jira_dt(c_created)
            if c_time < since_dt:
                continue

            body_text = ""
            for block in c.get("body", {}).get("content", []):
                for inline in block.get("content", []):
                    if inline.get("type") == "text":
                        body_text += inline.get("text", "")
                    elif inline.get("type") == "mention":
                        body_text += "@" + inline.get("attrs", {}).get("text", "")

            mentioned = account_id in str(c.get("body", {}))
            kind = "mention" if mentioned else "comment"
            events.append({
                "kind": kind,
                "text": f"{author.get('displayName', 'Someone')}: {body_text[:120]}",
            })
        except Exception:
            continue
    return events


def get_notifications(username, since_minutes=60):
    from datetime import datetime, timedelta, timezone

    account_id = _resolve_account_id(username)
    since_dt = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    since_jql = (datetime.utcnow() - timedelta(minutes=since_minutes + 60)).strftime("%Y-%m-%d %H:%M")

    jql = (
        f'(assignee = "{account_id}" OR reporter = "{account_id}" OR watcher = "{account_id}") '
        f'AND updated >= "{since_jql}" '
        f'ORDER BY updated DESC'
    )
    url = f"{_base_url()}/rest/api/3/search/jql"
    payload = {
        "jql": jql,
        "maxResults": 30,
        "fields": ["summary", "status", "issuetype", "comment", "updated"],
    }

    resp = requests.post(
        url, json=payload, auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    notifications = []
    for item in data.get("issues", []):
        f = item.get("fields", {})
        key = item["key"]
        summary = f.get("summary", "")
        updated = f.get("updated", "")
        issue_type = f.get("issuetype", {}).get("name", "") if f.get("issuetype") else ""
        status = f.get("status", {}).get("name", "") if f.get("status") else ""

        events = []
        events.extend(_get_changelog_events(key, account_id, since_dt))
        events.extend(_get_comment_events(f.get("comment", {}), account_id, since_dt))

        if events:
            notifications.append({
                "key": key,
                "summary": summary,
                "type": issue_type,
                "status": status,
                "updated": updated,
                "events": events,
            })

    return notifications
