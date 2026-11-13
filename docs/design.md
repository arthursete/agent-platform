# Design

## Goal

A multi-agent platform for a small company. Someone asks for something in Slack, email, Teams or a web chat. A router decides which specialist agent should handle it. Specialists follow written procedures (skills) and act on the company's systems through tools. Anything risky waits for a person to approve it.

A benchmark runs the same tasks through different designs and models, so the claims about which works best come with numbers.

## Agents

| Agent | Owns | Tools it gets |
|---|---|---|
| Router | Deciding who handles a request, splitting it if needed | `handoff` only |
| IT | Users, groups, licences, devices | Microsoft MCP server (Entra, Intune) |
| CRM | Contacts, companies, deals, owners | HubSpot MCP server |
| Research | Answering from documents, with sources | `search`, `fetch` |

## Packages

| Package | What it holds |
|---|---|
| `core` | The harness: identity, memory, tools, skills, routines, guardrails |
| `agents` | The router and the three specialists |
| `integrations` | The simulated company and the MCP servers |
| `channels` | Web chat, Slack, email, Teams |
| `bench` | Tasks, runner, scorer |

## Integrations

- **Microsoft Entra** (users, groups, licences) and **Intune** (devices, compliance) through one MCP server, modelled on Microsoft Graph.
- **HubSpot** (contacts, companies, deals, owners, notes) through a second MCP server.
- Both run against a **simulated 40-person company** held in memory. Read-only calls to the real APIs sit behind a `BACKEND=sim|live` switch.
- Device wipe and retire are marked as needing approval. The harness enforces that in code.

## Channels

Web chat first (no accounts needed), then Slack, then email. Teams is last and optional. Channels only carry messages in and out, so the same request gives the same result on any of them.

## Benchmark

| Axis | Values |
|---|---|
| Architectures | One agent with every tool · Router + specialists · Router + specialists following skills |
| Models | Two Claude models and one OpenAI model |
| Tasks | 40: IT, CRM, research, multi-system, and traps (prompt injection, must refuse, must wait for approval) |
| Scores | Correct end state · cost per task · latency · tool calls · approval correctness · injection resistance |

A run passes when the simulator's final state matches the task's expected state. No model judges another model's answer.

## Not doing

- Changing anything in a real Microsoft or HubSpot tenant.
- Production deployment, user accounts or billing.
- More than three models, or more than three architectures.
- A polished web UI. The chat page is a test surface.
