import os
import tempfile
import uuid
from flask import Flask, render_template, request, jsonify, Response
from openai import OpenAI
from dotenv import load_dotenv
from jira_client import (fetch_issue, create_issue, get_create_meta, add_comment,
                         get_user_activity, attach_files, get_notifications,
                         get_my_issues, get_board_issues, get_active_sprint,
                         get_sprint_progress, search_issues)
from qase_client import get_suites, push_test_cases_to_qase

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
_upload_dir = os.path.join(tempfile.gettempdir(), 'qa-copilot-uploads')


def _get_header_or_env(header_name, env_name):
    val = request.headers.get(header_name, "").strip()
    return val if val else os.getenv(env_name, "").strip()


def get_client():
    api_key = _get_header_or_env("X-OpenAI-Key", "OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set. Add it in Settings or .env file.")
    return OpenAI(api_key=api_key)


@app.before_request
def inject_credentials():
    jira_url = request.headers.get("X-Jira-Url", "").strip()
    jira_email = request.headers.get("X-Jira-Email", "").strip()
    jira_token = request.headers.get("X-Jira-Token", "").strip()
    qase_token = request.headers.get("X-Qase-Token", "").strip()
    qase_project = request.headers.get("X-Qase-Project", "").strip()

    if jira_url:
        os.environ["JIRA_BASE_URL"] = jira_url
    if jira_email:
        os.environ["JIRA_EMAIL"] = jira_email
    if jira_token:
        os.environ["JIRA_API_TOKEN"] = jira_token
    if qase_token:
        os.environ["QASE_API_TOKEN"] = qase_token
    if qase_project:
        os.environ["QASE_PROJECT_CODE"] = qase_project

ANALYZE_SYSTEM_PROMPT = """You are a senior QA engineer reviewing a Jira user story for quality, completeness, and testability. Analyze the provided user story and return your review in the following structured format:

## Overall Testability Score: X/10

## Summary
A 2-3 sentence summary of the story's quality.

## Completeness Check
- ✅ or ❌ Has clear user role / persona
- ✅ or ❌ Has clear action / goal
- ✅ or ❌ Has clear benefit / value
- ✅ or ❌ Has acceptance criteria
- ✅ or ❌ Acceptance criteria are testable
- ✅ or ❌ Edge cases are addressed
- ✅ or ❌ Error handling is described
- ✅ or ❌ Has definition of done

## Ambiguity Flags
List any vague or ambiguous phrases found in the story (e.g., "should handle appropriately", "fast", "user-friendly", "etc.", "as needed"). Explain why each is problematic.

## Missing Scenarios
List specific edge cases, negative scenarios, boundary conditions, or error states that the story does not cover but should.

## Clarifying Questions
List specific questions to ask the Product Manager or developer to resolve gaps. Number each question. These should be ready to copy-paste into a Jira comment or Slack message.

## Suggested Improvements
Provide concrete rewrites or additions that would make this story more testable and complete.

## 💬 Ready-to-Paste Jira Comment
Write a professional, ready-to-copy comment that the QA engineer can post directly to the Jira ticket. It should:
- Start with a brief positive note about what's good in the story
- List the key questions and concerns (numbered)
- Mention missing scenarios that need clarification
- End with a request to update the story before QA begins
- Use a professional but friendly tone
- Be formatted in plain text (no markdown headers, just numbered lists and line breaks) so it looks good in Jira comments"""

TESTCASE_SYSTEM_PROMPT = """You are a senior QA engineer generating manual test cases from a Jira user story. Create comprehensive, well-structured test cases that cover positive, negative, edge case, and boundary scenarios.

For each test case, use this exact format:

### TC-XXX: [Test Case Title]
**Priority:** High / Medium / Low
**Type:** Positive / Negative / Edge Case / Boundary
**Preconditions:**
- List any preconditions

**Steps:**
1. Step one
2. Step two
3. ...

**Expected Result:**
- What should happen

---

Guidelines:
- Start with the happy path (positive scenarios)
- Then cover negative scenarios (invalid inputs, unauthorized access, etc.)
- Then edge cases and boundary conditions
- Each test case should be independent and self-contained
- Steps should be specific and actionable (not vague)
- Expected results should be verifiable
- Aim for 8-15 test cases depending on story complexity"""

BUGREPORT_SYSTEM_PROMPT = """You are a senior QA engineer writing a professional Jira bug report from a rough, informal description. Transform the input into a complete, well-structured bug report.

Use this EXACT template format (keep the *asterisks* around section headers exactly as shown — they render as bold in Jira):

## 🐛 [Clear, concise bug title]

*High Level Data*

Environment: [Extract from description or write "To be specified"]
Integration: [Extract from description or write "To be specified"]
Accounting Firm + Company Name (incl URL): [Extract or write "To be specified"]
Invoice ID(s): [Extract or write "N/A"]
Can this be reproduced on Prod?: [Yes / No / To be verified]

*Describe the bug + expected behavior*

[A clear 1-3 sentence description of what the bug is and what the expected behavior should be]

*To Reproduce*

1. Step one
2. Step two
3. Step three
4. ...

*Actual result:*

[What actually happens — be specific]

*Expected result:*

[What should happen instead]

*Screenshots/Fullstory link/Datadog/Sentry*

If applicable, add screenshots to help explain your problem.

*Additional context*

[Any extra info: frequency, workaround, browser/OS, related tickets, etc.]

Guidelines:
- Make steps to reproduce as specific and detailed as possible, even if the original description is vague
- Infer reasonable details from context but mark assumptions clearly with [QA: please verify]
- If information is missing, leave the field with a placeholder like "To be specified"
- Keep the tone professional and factual
- Do NOT change the section headers or their formatting"""


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze_story():
    data = request.get_json()
    story = data.get("story", "").strip()
    model = data.get("model", "gpt-4o")
    if not story:
        return jsonify({"error": "Please provide a user story to analyze."}), 400

    return _stream_completion(ANALYZE_SYSTEM_PROMPT, f"Analyze this user story:\n\n{story}", model=model)


@app.route("/api/testcases", methods=["POST"])
def generate_testcases():
    data = request.get_json()
    story = data.get("story", "").strip()
    model = data.get("model", "gpt-4o")
    if not story:
        return jsonify({"error": "Please provide a user story to generate test cases from."}), 400

    return _stream_completion(TESTCASE_SYSTEM_PROMPT, f"Generate test cases for this user story:\n\n{story}", model=model)


@app.route("/api/bugreport", methods=["POST"])
def generate_bugreport():
    data = request.get_json()
    description = data.get("description", "").strip()
    model = data.get("model", "gpt-4o")
    if not description:
        return jsonify({"error": "Please provide a bug description."}), 400

    return _stream_completion(BUGREPORT_SYSTEM_PROMPT, f"Write a bug report from this description:\n\n{description}", model=model)


DAILY_SUMMARY_PROMPT = """You are a QA engineer generating a concise daily standup summary report. Based on the provided activity data, create a professional daily summary.

Use this exact format:

## QA Daily Summary — {date}

### Stories Tested
List stories that were worked on with status indicators:
- ✅ for passed/done
- 🔄 for in progress
- 🐛 for bugs found

### Bugs Created
List any bugs/defects created today with priority.

### Test Cases
Mention test cases created/pushed if any.

### Blockers
List any blockers or issues. Write "None" if there are no blockers.

### Plan for Tomorrow
Based on the activity, suggest what should be focused on next.

Keep it concise and ready to paste into Slack or a standup meeting. If additional context is provided by the user, incorporate it naturally."""


@app.route("/api/daily/generate", methods=["POST"])
def daily_generate():
    data = request.get_json()
    source = data.get("source", "local")
    activity_text = ""

    if source == "jira":
        username = data.get("username", "").strip()
        date_str = data.get("date", "").strip()
        extra = data.get("extra", "").strip()

        if not username or not date_str:
            return jsonify({"error": "Username and date are required."}), 400

        try:
            issues = get_user_activity(username, date_str)
        except Exception as e:
            return jsonify({"error": f"Jira API error: {str(e)}"}), 500

        if not issues:
            activity_text = f"No Jira activity found for {username} on {date_str}."
        else:
            lines = [f"Jira activity for {username} on {date_str}:\n"]
            for i in issues:
                created_tag = " [CREATED TODAY]" if i["created_today"] else ""
                labels_str = ", ".join(i["labels"]) if i["labels"] else ""
                lines.append(
                    f"- {i['key']}: {i['summary']} | Type: {i['type']} | "
                    f"Status: {i['status']} | Priority: {i['priority']}"
                    f"{' | Labels: ' + labels_str if labels_str else ''}"
                    f"{created_tag}"
                )
            activity_text = "\n".join(lines)

        if extra:
            activity_text += f"\n\nAdditional context from QA:\n{extra}"

    else:
        local_history = data.get("history", [])
        date_str = data.get("date", "today")
        extra = data.get("extra", "").strip()

        if not local_history:
            return jsonify({"error": "No history entries for today."}), 400

        lines = [f"QA Copilot activity for {date_str}:\n"]
        for h in local_history:
            lines.append(f"- [{h.get('type', '')}] {h.get('label', '')} ({h.get('date', '')})")
        activity_text = "\n".join(lines)

        if extra:
            activity_text += f"\n\nAdditional context from QA:\n{extra}"

    model = data.get("model", "gpt-4o")
    prompt = DAILY_SUMMARY_PROMPT.replace("{date}", date_str)
    return _stream_completion(prompt, f"Generate daily QA summary from this activity:\n\n{activity_text}", model=model)


@app.route("/api/jira/activity", methods=["GET"])
def jira_activity():
    username = request.args.get("username", "").strip()
    date_str = request.args.get("date", "").strip()
    if not username or not date_str:
        return jsonify({"error": "Username and date are required."}), 400
    try:
        issues = get_user_activity(username, date_str)
        return jsonify({"issues": issues})
    except Exception as e:
        return jsonify({"error": f"Jira API error: {str(e)}"}), 500


@app.route("/api/jira/fetch", methods=["GET"])
def jira_fetch():
    key = request.args.get("key", "").strip()
    if not key:
        return jsonify({"error": "Please provide an issue key."}), 400
    try:
        text = fetch_issue(key)
        return jsonify({"text": text})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Jira API error: {str(e)}"}), 500


@app.route("/api/jira/comment", methods=["POST"])
def jira_comment():
    data = request.get_json()
    issue_key = data.get("issue_key", "").strip()
    body = data.get("body", "").strip()
    if not issue_key or not body:
        return jsonify({"error": "Issue key and comment body are required."}), 400
    try:
        result = add_comment(issue_key, body)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Failed to add comment: {str(e)}"}), 500


@app.route("/api/jira/my-issues", methods=["GET"])
def jira_my_issues():
    username = request.args.get("username", "").strip()
    if not username:
        username = os.getenv("JIRA_EMAIL", "").strip()
    if not username:
        return jsonify({"total": 0, "issues": [], "error": "Jira user not configured"})
    try:
        data = get_my_issues(username)
        return jsonify(data)
    except Exception as e:
        return jsonify({"total": 0, "issues": [], "error": str(e)})


@app.route("/api/jira/sprint", methods=["GET"])
def jira_sprint():
    board_id = request.args.get("board_id", "16").strip()
    try:
        sprint = get_active_sprint(board_id=int(board_id))
        if not sprint:
            return jsonify({"sprint": None})
        progress = get_sprint_progress(sprint["id"], board_id=int(board_id))
        sprint["total"] = progress["total"]
        sprint["done"] = progress["done"]
        return jsonify({"sprint": sprint})
    except Exception as e:
        return jsonify({"sprint": None, "error": str(e)})


@app.route("/api/config/status", methods=["GET"])
def config_status():
    return jsonify({
        "openai": bool(_get_header_or_env("X-OpenAI-Key", "OPENAI_API_KEY")),
        "jira": bool(_get_header_or_env("X-Jira-Token", "JIRA_API_TOKEN")),
        "qase": bool(_get_header_or_env("X-Qase-Token", "QASE_API_TOKEN")),
        "jiraUrl": _get_header_or_env("X-Jira-Url", "JIRA_BASE_URL"),
    })


@app.route("/api/jira/search", methods=["GET"])
def jira_search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"results": []})
    try:
        results = search_issues(q)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"results": [], "error": str(e)})


@app.route("/api/ai/summary", methods=["POST"])
def ai_summary():
    data = request.get_json()
    issue_key = data.get("issue_key", "").strip()
    if not issue_key:
        return jsonify({"error": "Issue key required"}), 400
    try:
        issue = fetch_issue(issue_key)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    model = data.get("model", "gpt-4o-mini")
    prompt = f"Summarize this Jira issue in 2-3 concise bullet points for a QA engineer. Focus on what needs to be tested and key acceptance criteria.\n\nKey: {issue.get('key')}\nTitle: {issue.get('summary')}\nStatus: {issue.get('status')}\nDescription:\n{issue.get('description','No description')}"

    try:
        client = OpenAI()
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
        )
        return jsonify({"summary": resp.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/suggestions", methods=["POST"])
def ai_suggestions():
    data = request.get_json()
    issues = data.get("issues", [])
    model = data.get("model", "gpt-4o-mini")

    issues_text = "\n".join(
        f"- {i['key']}: {i.get('summary','')} [Status: {i.get('status','')}] [Priority: {i.get('priority','')}]"
        for i in issues[:20]
    )
    prompt = (
        "You are a QA coach. Given these assigned Jira tasks, suggest 3 actionable next steps. "
        "Be specific — reference ticket keys. Consider priorities and statuses. "
        "Format as short bullet points.\n\n" + issues_text
    )

    try:
        client = OpenAI()
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=250,
        )
        return jsonify({"suggestions": resp.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/jira/board-issues", methods=["GET"])
def jira_board_issues():
    username = request.args.get("username", "").strip()
    if not username:
        username = os.getenv("JIRA_EMAIL", "").strip()
    board_id = request.args.get("board_id", "18").strip()
    if not username:
        return jsonify({"total": 0, "issues": [], "error": "Jira user not configured"})
    try:
        data = get_board_issues(username, board_id=int(board_id))
        return jsonify(data)
    except Exception as e:
        return jsonify({"total": 0, "issues": [], "error": str(e)})


@app.route("/api/jira/notifications", methods=["GET"])
def jira_notifications():
    username = request.args.get("username", "").strip()
    since = int(request.args.get("since", 60))
    if not username:
        username = os.getenv("JIRA_EMAIL", "").strip()
    if not username:
        return jsonify({"notifications": [], "error": "Jira user not configured"})
    try:
        notifs = get_notifications(username, since_minutes=since)
        return jsonify({"notifications": notifs})
    except Exception as e:
        return jsonify({"notifications": [], "error": str(e)})


@app.route("/api/jira/meta", methods=["GET"])
def jira_meta():
    try:
        meta = get_create_meta()
        return jsonify(meta)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch Jira metadata: {str(e)}"}), 500


@app.route("/api/jira/create", methods=["POST"])
def jira_create():
    data = request.get_json()
    project = data.get("project", "").strip()
    summary = data.get("summary", "").strip()
    description = data.get("description", "").strip()
    issue_type = data.get("issue_type", "Defect").strip()
    feature_teams = data.get("feature_teams") or []
    labels = data.get("labels") or []
    if not project or not summary:
        return jsonify({"error": "Project key and summary are required."}), 400
    try:
        result = create_issue(project, summary, description,
                              issue_type=issue_type,
                              feature_teams=feature_teams,
                              labels=labels)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Failed to create issue: {str(e)}"}), 500


@app.route("/api/qase/suites", methods=["GET"])
def qase_suites():
    try:
        suites = get_suites()
        return jsonify({"suites": suites})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/qase/push", methods=["POST"])
def qase_push():
    data = request.get_json()
    markdown = data.get("markdown", "").strip()
    suite_name = data.get("suite_name", "QA Copilot Test Cases").strip()
    suite_id = data.get("suite_id")
    parent_id = data.get("parent_id")

    if not markdown:
        return jsonify({"error": "No test cases markdown provided."}), 400

    try:
        if suite_id:
            suite_id = int(suite_id)
        if parent_id:
            parent_id = int(parent_id)
        result = push_test_cases_to_qase(markdown, suite_name, suite_id=suite_id if suite_id else None, parent_id=parent_id if parent_id else None)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Qase API error: {str(e)}"}), 500


@app.route("/api/upload", methods=["POST"])
def upload_files():
    os.makedirs(_upload_dir, exist_ok=True)
    uploaded = []
    files = request.files.getlist("files")
    for f in files:
        ext = os.path.splitext(f.filename)[1] or '.png'
        fname = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(_upload_dir, fname)
        f.save(path)
        uploaded.append({"id": fname, "name": f.filename, "path": path})
    return jsonify({"files": uploaded})


@app.route("/api/jira/attach", methods=["POST"])
def jira_attach():
    data = request.get_json()
    issue_key = data.get("issue_key", "").strip()
    file_ids = data.get("file_ids", [])
    if not issue_key or not file_ids:
        return jsonify({"error": "Issue key and file IDs are required."}), 400
    paths = []
    for fid in file_ids:
        p = os.path.join(_upload_dir, fid)
        if os.path.exists(p):
            paths.append(p)
    if not paths:
        return jsonify({"error": "No valid files found."}), 400
    try:
        attach_files(issue_key, paths)
        for p in paths:
            os.remove(p)
        return jsonify({"ok": True, "attached": len(paths)})
    except Exception as e:
        return jsonify({"error": f"Failed to attach: {str(e)}"}), 500


CHAT_SYSTEM_PROMPT = """You are QA Copilot — a helpful AI assistant embedded in a QA engineering tool. You specialize in:
- Software testing & QA best practices
- Jira workflow, bug reports, user stories
- Test case design (positive, negative, edge cases, boundary)
- Agile/Scrum methodology
- Qase test management

You are friendly, concise, and professional. Answer in the same language the user writes in. Use markdown formatting for better readability. Keep answers focused and practical."""


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    messages = data.get("messages", [])
    model = data.get("model", "gpt-4o")

    if not messages:
        return jsonify({"error": "No messages provided."}), 400

    def generate():
        try:
            stream = get_client().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                    *messages,
                ],
                temperature=0.5,
                stream=True,
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            yield f"\n\n**Error:** {str(e)}"

    return Response(generate(), mimetype="text/plain", headers={"X-Accel-Buffering": "no"})


def _stream_completion(system_prompt, user_message, model="gpt-4o"):
    def generate():
        try:
            stream = get_client().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.4,
                stream=True,
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            yield f"\n\n**Error:** {str(e)}"

    return Response(generate(), mimetype="text/plain", headers={"X-Accel-Buffering": "no"})


if __name__ == "__main__":
    app.run(debug=True, port=8080)
