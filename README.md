# @phiacta/mcp

MCP server for interacting with the Phiacta knowledge platform.

## Setup

Add to your MCP client config (Claude Code, Cursor, Codex, etc.):

```json
{
  "mcpServers": {
    "phiacta": {
      "command": "npx",
      "args": ["-y", "github:Noah-Everett/phiacta-mcp"],
      "env": {
        "PHIACTA_TOKEN": "<your-token>"
      }
    }
  }
}
```

Create an account at [phiacta.com](https://phiacta.com) and generate a personal access token under Settings > Tokens.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PHIACTA_API_URL` | `https://api.phiacta.com` | Phiacta API base URL |
| `PHIACTA_TOKEN` | | Personal access token (recommended) |
| `PHIACTA_HANDLE` | | User handle (alternative to token) |
| `PHIACTA_PASSWORD` | | User password (alternative to token) |

## Local Development

```bash
npm install
npm run build

PHIACTA_API_URL=http://localhost:8000 \
PHIACTA_TOKEN=your-token \
npm start
```

Or with hot reload:

```bash
PHIACTA_API_URL=http://localhost:8000 \
PHIACTA_TOKEN=your-token \
npm run dev
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_entries` | List entries with pagination and filters |
| `get_entry` | Get entry details with refs |
| `search_entries_by_tags` | Find entries by tags |
| `get_entry_tags` | Get tags for an entry |
| `get_entry_references` | Get refs for an entry |
| `create_entry` | Create a new knowledge entry |
| `create_entry_ref` | Link two entries with a typed reference |
| `set_entry_tags` | Set tags on an entry |
| `update_entry` | Update entry metadata |
