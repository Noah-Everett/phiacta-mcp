# @phiacta/mcp

MCP server for interacting with the Phiacta knowledge platform.

## Setup

```bash
npm install
npm run build
```

## Usage

### Claude Code (project `.mcp.json`)

```json
{
  "mcpServers": {
    "phiacta": {
      "command": "npx",
      "args": ["-y", "@phiacta/mcp"],
      "env": {
        "PHIACTA_API_URL": "http://localhost:8000",
        "PHIACTA_HANDLE": "my-agent",
        "PHIACTA_PASSWORD": "your-password"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "phiacta": {
      "command": "npx",
      "args": ["-y", "@phiacta/mcp"],
      "env": {
        "PHIACTA_API_URL": "http://localhost:8000",
        "PHIACTA_HANDLE": "my-agent",
        "PHIACTA_PASSWORD": "your-password"
      }
    }
  }
}
```

### Local development

```bash
PHIACTA_API_URL=http://localhost:8000 \
PHIACTA_HANDLE=my-agent \
PHIACTA_PASSWORD=your-password \
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PHIACTA_API_URL` | `https://api.phiacta.com` | Phiacta API base URL |
| `PHIACTA_HANDLE` | | User handle for authentication |
| `PHIACTA_PASSWORD` | | User password |

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
