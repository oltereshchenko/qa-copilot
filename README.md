# QA Copilot

An AI-powered QA productivity tool built for the Vic.ai AI Hackathon (April 2025).

## Problem

Manual QA engineers spend a significant amount of time on repetitive, high-effort tasks that slow down the development cycle:

- **Reviewing user stories** — reading through Jira tickets to identify ambiguity, missing acceptance criteria, and untestable requirements takes 15–30 minutes per story. Feedback often comes too late in the sprint.
- **Writing test cases** — translating user stories into structured, push-ready test cases for Qase is tedious and error-prone. Formatting, edge cases, and negative scenarios are frequently missed.
- **Filing bug reports** — turning rough notes and screenshots into professional, developer-friendly Jira bug reports with all required fields (environment, reproduction steps, expected behavior) is a context-switching tax.
- **Tracking work across boards** — QA engineers juggle multiple Jira boards (implementation, production incidents, feature testing) and lack a single view of everything assigned to them.
- **Daily standups** — compiling what was done yesterday and what's planned today requires manually reviewing Jira activity and memory.

These tasks affect every QA engineer on the team and collectively consume hours each week that could be spent on actual testing.

## Solution

**QA Copilot** is a web application that uses GPT-4o to automate and accelerate the core QA workflow. It integrates directly with Jira Cloud and Qase, providing a single workspace for all QA activities.

### Core AI Features

- **Analyze Story** — Paste or fetch a Jira user story by key. AI reviews it for completeness, ambiguity, missing scenarios, edge cases, and generates clarifying questions with a testability score. Includes a ready-to-paste Jira comment and a "Post as Jira Comment" button.
- **Generate Test Cases** — AI generates structured test cases (preconditions, steps, expected results) from any user story. One-click push to Qase with auto-named test suites.
- **Write Bug Report** — Describe a bug in plain text or use the built-in template. AI transforms it into a professional bug report. One-click creation in Jira with all fields (space, work type, feature teams, labels, status) pre-filled. Supports drag & drop screenshot upload and attachment to Jira.
- **Daily Summary** — Generates a standup report from local history or Jira activity (issues updated/created that day).
- **AI Chatbot** — In-app chat assistant for QA-related questions, accessible via a floating button.
- **AI Summary on Cards** — Hover over any Kanban card and get an instant AI summary of the ticket without opening Jira.
- **Smart Suggestions** — AI analyzes all assigned tasks and recommends the next 3 actions based on priorities and statuses.

### Dashboard

- **Kanban Board** — Three boards showing all assigned tasks grouped by status columns:
  - Implementation board (Backlog → To Do → In Progress → Ready for QA → In QA → Ready To Release)
  - Production Incidents (Work in progress → Waiting for customer → QA Review)
  - RFTR Board (Feature Testing Results)
- **Sprint Widget** — Active sprint name, dates, days remaining, and progress bar with board selector.
- **Quick Jira Search** — Search any ticket by key or text directly from the dashboard.
- **Stats Cards** — Today's analyses, test cases, bug reports, and all-time total.
- **Quick Actions** — One-click navigation to any tool.
- **Recent Activity** — Last 6 actions from history, clickable to reload results.

### Integrations

- **Jira Cloud** — Fetch stories, create bugs, post comments, attach files, search issues, get sprint data, poll notifications (assigned/commented/mentioned).
- **Qase** — List suites, create suites, push test cases with auto-generated suite names.

### UX

- Dark/Light theme toggle
- AI model selector (GPT-4o / GPT-4o-mini)
- History & Favorites with toggle add/remove
- Notification bell with real-time Jira polling
- Fullscreen output mode
- Collapsible Kanban boards with state persistence
- Responsive modern UI (Linear/Vercel-inspired design)

## Impact

- **Story analysis: saves ~20 min per story** — AI catches ambiguity, missing edge cases, and generates clarifying questions instantly vs. manual review. For 5 stories/sprint, that's ~1.5 hours saved.
- **Test case generation: saves ~30 min per story** — Structured test cases with edge cases and negative scenarios generated in seconds. Direct push to Qase eliminates manual formatting. For 5 stories/sprint, that's ~2.5 hours saved.
- **Bug reporting: saves ~10 min per bug** — Template + AI + one-click Jira creation with screenshots. For 10 bugs/week, that's ~1.5 hours saved.
- **Dashboard: saves ~15 min/day** — No more switching between 3 Jira boards, searching tickets, or compiling standup notes. That's ~1.25 hours/week.
- **Total estimated savings: ~7+ hours/week per QA engineer.**
- **Quality improvement** — AI consistently catches edge cases and missing scenarios that humans miss under time pressure. More thorough test coverage reduces escaped defects.

## Demo Instructions

### Prerequisites

- Python 3.9+
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Jira Cloud API token ([how to create](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/))
- Qase API token (optional, for test case push — [get one here](https://app.qase.io/user/api/token))

### Setup

```bash
cd new-project

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

python3 app.py
```

Open **http://localhost:8080** in your browser.

### Configuring API Keys

There are two ways to provide API keys — choose whichever is more convenient:

**Option A: Settings page (recommended for multi-user / quick demo)**

1. Open the app and click **Settings** in the sidebar.
2. Fill in the **API Keys** section:
   - **OpenAI API Key** — your `sk-...` key
   - **Jira Base URL** — e.g. `https://yourcompany.atlassian.net`
   - **Jira Email** — your Atlassian account email
   - **Jira API Token** — your Jira API token
   - **Qase API Token** — your Qase token (optional)
   - **Qase Project Code** — e.g. `MFTS` (optional)
3. Click **Save Settings**.
4. Status badges below will show **Connected** / **Not configured** for each integration.

Keys are stored in your browser's localStorage — each user on the same machine can use their own keys by using a different browser or incognito window.

**Option B: `.env` file (recommended for solo use / persistent setup)**

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
OPENAI_API_KEY=sk-your-key-here
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
QASE_API_TOKEN=your-qase-api-token
QASE_PROJECT_CODE=YOUR_CODE
```

Restart the server after changing `.env`.

> **Note:** Settings page values take priority over `.env`. If both are configured, the Settings page keys are used.

### How to Use

#### Dashboard

The **Dashboard** is the home page. It shows:
- **Sprint widget** — select a board from the dropdown to see the active sprint, progress bar, and days remaining.
- **Quick Jira Search** — type a ticket key or keyword to search Jira instantly.
- **Stats** — how many analyses, test cases, and bug reports you've created today.
- **Kanban boards** — all your assigned Jira tasks grouped by status. Click the collapse arrow to hide/show each board. Boards persist their collapsed state.
- **Quick actions on cards** — hover over any Kanban card to see action buttons:
  - **AI Summary** (sparkles icon) — generates a short AI summary of the ticket in a popup.
  - **Analyze** (search icon) — opens the Analyze tab with the Jira key pre-filled and fetched.
  - **Test Cases** (clipboard icon) — opens the Test Cases tab with the Jira key pre-filled.
  - **Open in Jira** (external link icon) — opens the ticket in Jira.
- **Smart Suggestions** — click "Get AI Suggestions" to receive 3 recommended next actions based on your current tasks.

#### Analyze Story

1. Go to the **Analyze Story** tab.
2. Enter a Jira ticket key (e.g. `ENG-21660`) and click **Fetch from Jira**, or paste the user story text directly.
3. Click **Analyze Story**. The AI will review the story and return:
   - Testability score (1–10)
   - Completeness checklist
   - Missing scenarios and edge cases
   - Clarifying questions
   - Ready-to-paste Jira comment
4. Click **Post as Jira Comment** to send the analysis directly to the Jira ticket.
5. Click **Generate Test Cases from this** to transfer the story to the Test Cases tab.
6. Click the **star icon** to save the result to Favorites.

#### Generate Test Cases

1. Go to the **Test Cases** tab.
2. Enter or fetch a Jira story, then click **Generate Test Cases**.
3. AI generates structured test cases with preconditions, steps, and expected results.
4. Click **Push to Qase** to create them in your Qase project:
   - Suite name is auto-filled from the Jira ticket (e.g. `ENG-21660 - Remove summary page`).
   - Choose a parent folder or create a new suite.

#### Bug Report

1. Go to the **Bug Report** tab.
2. Click **Insert Template** to load the bug report template with all required fields.
3. Fill in the fields (environment, steps to reproduce, expected behavior, etc.).
4. Optionally, **drag & drop screenshots** onto the drop zone area.
5. Click **Generate Bug Report** to let AI polish the report, or go straight to **Create in Jira**.
6. In the Jira creation modal, all fields are pre-filled (Space, Work Type, Feature Team, Labels, Status). Adjust if needed and click **Create**.

#### Daily Summary

1. Go to the **Daily Summary** tab.
2. Choose the source:
   - **Local History** — generates a summary from your today's actions in QA Copilot.
   - **Jira Activity** — fetches all your Jira activity for today (updated/created issues).
3. Click **Generate Summary**. Use the output for your standup.

#### AI Chat

- Click the **chat bubble** (bottom-right corner) to open the AI assistant.
- Ask any QA-related question — testing strategies, best practices, how to write a test case, etc.
- Conversation persists during the session.

#### Notifications

- Click the **bell icon** in the sidebar to see Jira notifications.
- Notifications appear when tasks are assigned to you, someone comments on your watched issues, or you're mentioned.
- Polling interval is configurable in **Settings** (default: 60 seconds).
- Click **Mark all read** to clear notifications.
- Click any notification to open the ticket in Jira.

#### History & Favorites

- **History** — every AI result is automatically saved. Click any history entry in the sidebar to reload it.
- **Favorites** — click the **star icon** on any result or history entry to save/remove it from Favorites. Favorites appear in the sidebar for quick access.

#### Settings

- **API Keys** — configure OpenAI, Jira, and Qase credentials (see above).
- **Profile** — set your Jira username for activity tracking.
- **Jira Defaults** — default Space, Work Type, Feature Team, and Labels for bug creation.
- **AI** — choose between GPT-4o (best quality) and GPT-4o-mini (faster & cheaper).
- **Notifications** — enable/disable Jira notifications and set the polling interval.
- **Qase** — set default parent suite for test case push.

### Tech Stack

- **Backend:** Python, Flask, OpenAI API
- **Frontend:** Vanilla HTML/CSS/JS, Marked.js, Lucide Icons
- **Integrations:** Jira Cloud REST API v3, Jira Agile API, Qase API v1
- **Storage:** localStorage (client-side history, favorites, settings, API keys)
