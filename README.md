# agent-platform

A multi-agent platform that takes requests from Slack, email, Teams and the web, and works across Microsoft Entra, Intune and HubSpot, with a benchmark comparing models and architectures.

Work in progress. The design is in [docs/design.md](docs/design.md).

## Layout

```
packages/
  core/           the harness every agent runs on
  agents/         router and specialists
  integrations/   simulated company and MCP servers
  channels/       web, Slack, email, Teams
  bench/          benchmark tasks, runner, scorer
lessons/          the step-by-step files the harness was learned from
```

## Run

```
npm install
npm run typecheck
npm test                             # no API key needed: tests fake the model
npm run web                          # chat with the IT agent at http://localhost:3000 (needs the key)
npm run lesson lessons/01-hello.ts   # needs ANTHROPIC_API_KEY in .env
```
