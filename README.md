# QA Copilot

An AI-powered QA productivity tool built for the Vic.ai AI Hackathon (April 2025).

## Team
- **Team name:** Solo
- **Team members:** Oleksii Tereshchenko
- **Repository:** [github.com/oltereshchenko/qa-copilot](https://github.com/oltereshchenko/qa-copilot)
- **Live app:** Not deployed (runs locally)

## What We Built

QA Copilot is a web-based AI assistant for manual QA engineers. It automates the most time-consuming parts of the QA workflow — analyzing user stories, generating test cases, writing bug reports, and tracking work across Jira boards — all from a single interface with direct Jira and Qase integrations.

## Problem
- **Users:** Manual QA engineers
- **Current pain:** Reviewing user stories for testability takes 15–30 min each. Writing structured test cases is tedious and error-prone. Filing bug reports with all required fields is a context-switching tax. Tracking work across 3+ Jira boards wastes ~15 min/day. Compiling daily standup notes requires manually reviewing Jira activity.
- **Our solution:** AI automates story analysis, test case generation, and bug report formatting. A unified dashboard consolidates all Jira boards, sprint data, and notifications. One-click integrations push results directly to Jira and Qase.

## Demo Video
- **Loom:** [Watch the demo](https://www.loom.com/share/d55c6d8fc7cf42db9501edc604bf3b12)
- **Transcript:** Included below

<details>
<summary>Video Transcript</summary>

**[0:00]** Hello guys, my name is Alexey. I built QA Copilot for the Vic.ai Hackathon. Let me show you what it does and why.

**[0:11]** As a manual QA engineer, I spend a lot of time creating test cases, analyzing user stories, creating bug reports, and everything else. Around 30 minutes to one hour per user story just to read, analyze, and create test cases. It also takes a lot of time switching between different Jira boards. So I built QA Copilot to make our life a little bit easier.

**[0:51]** First, to use the application you need to add all credentials in Settings. You add your OpenAI API key, Jira base URL, Jira email, Jira token, and optionally Qase API token and project code for test case management. You also add your Jira username to see all tickets assigned to you. There are settings for AI model selection (two models — one cheaper, one better), notification preferences, and Qase defaults. At the bottom you can see connection status — everything green means everything is connected.

**[2:10]** On the Dashboard you can see the current sprint info — sprint number, dates, days remaining, how many stories are done. It's integrated with Jira, pulling all information automatically. You can select your team. Below that, you see all Jira tickets assigned to you across three boards: the main engineering board, production incidents, and the implementation board — all with different status columns, all in one place.

**[3:27]** When you hover over any ticket, there are four quick actions: open in Jira, generate test cases, analyze the user story, and get an AI summary. The AI summary gives you a quick overview of the ticket without opening Jira.

**[4:08]** Clicking Analyze opens the Analyze tab with the story pre-filled. You see all requirements from Jira. Click "Analyze User Story" and AI returns a testability score, completeness checks, missing scenarios, clarifying questions, and a ready-to-paste Jira comment. You can post this comment directly to the Jira ticket with one click.

**[5:26]** For test cases, click the generate button. AI generates structured test cases. Click "Push to Qase" — you can add to an existing suite or create a new one with an auto-populated name. Select a parent folder and push. Test cases appear in Qase immediately with all details.

**[7:12]** The Bug Report tab has a template you can insert. Fill in the details, then click "Quick Create in Jira." All fields are pre-populated — summary, space, work type, feature team, labels. Adjust if needed and create. The Jira ticket is created instantly.

**[8:40]** Daily Summary has two options: generate from QA Copilot history or from Jira Activity. Select Jira Activity, pick a date, and generate a summary of what was done. Copy it and use it for your daily standup.

**[9:17]** Notifications show when tickets are updated or someone comments on your Jira issues. You can see new notifications and notification history. Clicking a notification opens the Jira ticket.

**[9:36]** History saves all previous AI results. Click any entry to reload it. You can mark results as favorites for quick access.

**[10:46]** The AI Chat assistant is available via the floating button. Ask it anything — help with test cases, analysis, prioritization, or any QA-related questions.

**[11:19]** This is the basic functionality for the hackathon. More features will be added going forward.

</details>

## What Judges Should Know
- **Most important demo moment:** End-to-end flow from Jira ticket → AI analysis → generated test cases → one-click push to Qase (all without leaving the app)
- **Business impact:** Estimated ~7 hours/week saved per QA engineer by automating story reviews, test case writing, bug reporting, and board navigation
- **Technical differentiator:** Real bidirectional integrations with Jira Cloud and Qase — not just reading data, but creating issues, posting comments, attaching files, and pushing test cases directly from AI output

## Demo Walkthrough
1. Open Settings, configure API keys, verify green connection badges
2. Dashboard: view sprint progress, Kanban boards across 3 Jira boards, quick-action buttons on cards
3. Click "Analyze" on a Kanban card → AI analyzes the story → post clarifying questions as a Jira comment
4. Click "Generate Test Cases" → AI generates structured test cases → push to Qase with one click
5. Bug Report: insert template, fill in details, drag & drop screenshots → create in Jira with pre-filled fields
6. Daily Summary: select Jira Activity source, generate standup report
7. Notifications: real-time Jira status changes, comments, and mentions

## Key Features
- **AI Story Analysis** — testability scoring, completeness checks, missing scenarios, clarifying questions
- **AI Test Case Generation** — structured test cases with one-click push to Qase
- **AI Bug Report Writer** — template-based, one-click Jira creation with drag & drop screenshots
- **Unified Dashboard** — multi-board Kanban, sprint widget, quick Jira search, AI summary on cards
- **Daily Summary** — auto-generated standup notes from Jira activity
- **AI Chat** — in-app assistant for QA-related questions
- **Jira Notifications** — real-time polling for status changes, comments, and mentions
- **Smart Suggestions** — AI recommends next 3 actions based on assigned tasks

## What Is Fully Working
- Fetch any Jira issue by key and display formatted content
- AI analysis with testability score, posted directly as Jira comment
- AI test case generation with push to Qase (creates suites and test cases)
- Bug report creation in Jira with custom fields (space, work type, feature team, labels)
- Screenshot upload and attachment to Jira issues
- Multi-board Kanban dashboard with live Jira data
- Sprint progress widget with board selector
- Real-time Jira notifications (status changes, comments, mentions, assignments)
- History, favorites, dark/light theme, AI model selector

## What Is Mocked, Incomplete, or Future Work
- No user authentication (single-user local tool; API keys stored in browser localStorage)
- Not deployed — runs locally only
- Notification polling depends on Jira API rate limits; no WebSocket/webhook support
- Limited to Jira Cloud (no Jira Server/Data Center support)
- AI output quality depends on story completeness — garbage in, garbage out
- Future: browser extension for in-Jira AI overlay, team-wide analytics dashboard, automated regression test suggestions

## Business Impact
- **Primary users:** Manual QA engineers on any team using Jira + Qase
- **Why it matters:** QA engineers spend ~40% of their time on documentation and context-switching rather than actual testing. This tool reclaims that time.
- **Expected value:** ~7 hours/week saved per engineer (story analysis: 1.5h, test cases: 2.5h, bug reports: 1.5h, dashboard/standup: 1.25h)
- **Success metric:** Reduction in time-to-first-test-case per story; increase in edge cases and negative scenarios covered

## Technical Overview
- **Stack:** Python 3.9+, Flask, OpenAI API, vanilla HTML/CSS/JS, Marked.js, Lucide Icons
- **Architecture:** Flask serves a single-page app with client-side routing. Backend proxies all AI and integration calls. Frontend uses localStorage for state persistence.
- **AI usage:** OpenAI GPT-4o / GPT-4o-mini for story analysis, test case generation, bug report polishing, daily summaries, chat, card summaries, and smart suggestions (7 distinct AI prompts)
- **Notable decisions:** Vanilla JS (no framework) for fast iteration and zero build step; API keys configurable via UI for multi-user demo; streaming AI responses for real-time feedback; SRI hashes on CDN scripts; CSP security headers

## Repository Guide
- **Entry point:** `python3 app.py`
- **Important paths:**
  - `app.py` — Flask backend, API routes, AI prompts
  - `jira_client.py` — Jira Cloud API integration (fetch, create, comment, attach, notifications)
  - `qase_client.py` — Qase API integration (suites, test cases)
  - `templates/index.html` — Main HTML (single-page app structure)
  - `static/app.js` — Frontend application logic
  - `static/style.css` — Styles (dark/light themes)
- **Configuration:** `.env` file or Settings page in the app (see below)

## Local Setup
```bash
git clone https://github.com/oltereshchenko/qa-copilot.git
cd qa-copilot

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
```

## Run Instructions
```bash
python3 app.py
```
Open **http://localhost:8080** in your browser.

## Credentials Or Demo Data
- **API keys required (provide your own — never committed to repo):**
  - `OPENAI_API_KEY` — OpenAI API key ([get one here](https://platform.openai.com/api-keys))
  - `JIRA_BASE_URL` — Your Jira Cloud URL (e.g. `https://yourcompany.atlassian.net`)
  - `JIRA_EMAIL` — Your Atlassian account email
  - `JIRA_API_TOKEN` — Jira API token ([how to create](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/))
  - `QASE_API_TOKEN` — Qase API token (optional, [get one here](https://app.qase.io/user/api/token))
  - `QASE_PROJECT_CODE` — Your Qase project code (optional)
- **Two ways to configure:**
  1. **Settings page** (recommended for demo) — open the app → Settings → API Keys section → paste keys → Save
  2. **`.env` file** — copy `.env.example` to `.env` and fill in values; restart server
- Settings page values override `.env` values when both are present
- **DO NOT COMMIT ANY API KEYS INTO THE REPO** — `.env` is in `.gitignore`

## Known Risks Or Open Questions
- OpenAI API costs scale with usage (~$0.01–0.03 per analysis/generation with GPT-4o)
- Jira API rate limits may affect notification polling on high-activity projects
- localStorage API key storage is not suitable for production — acceptable for local hackathon tool
- ADF (Atlassian Document Format) parsing covers common elements but may miss complex formatting

## If We Had More Time
- Deploy as a hosted web app with proper auth (OAuth with Atlassian/Google)
- Add Jira webhook support for instant notifications (replace polling)
- Build a browser extension for in-Jira AI overlay
- Add team-wide QA analytics dashboard (coverage trends, defect density)
- Support Jira Server / Data Center in addition to Cloud
- Add automated regression test suggestions based on code changes
