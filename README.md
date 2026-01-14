# PlayVideo MCP Server

[![npm version](https://img.shields.io/npm/v/@playvideo/playvideo-mcp.svg)](https://www.npmjs.com/package/@playvideo/playvideo-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@playvideo/playvideo-mcp.svg)](https://www.npmjs.com/package/@playvideo/playvideo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Model Context Protocol (MCP) server for PlayVideo API. Enables AI assistants like Claude to manage your videos directly.

## What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io) is an open protocol that allows AI assistants to interact with external tools and data sources. This MCP server lets Claude (and other MCP-compatible assistants) manage your PlayVideo videos.

## Features

- **Collections** - List/create/delete collections
- **Videos** - List videos, get details, delete
- **Webhooks** - Create, test, update, and manage webhooks
- **Embed settings** - Read/update player settings and sign embeds
- **API keys** - List/create/delete API keys
- **Account** - Read/update account settings
- **Usage** - Monitor plan limits and quotas
- **Upload instructions** - Get curl/SDK commands for uploading

## Installation

### For Claude Desktop

1. Install the MCP server globally:

```bash
npm install -g @playvideo/playvideo-mcp
```

Or run without installing:

```bash
npx @playvideo/playvideo-mcp
```

2. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "playvideo": {
      "command": "playvideo-mcp",
      "env": {
        "PLAYVIDEO_API_KEY": "play_live_your_api_key"
      }
    }
  }
}
```

3. Restart Claude Desktop

### For Development

```bash
cd mcp
npm install
npm run build
```

Run locally:

```bash
PLAYVIDEO_API_KEY=play_live_xxx npm start
```

## Usage Examples

Once configured, you can ask Claude things like:

- "List my video collections"
- "Create a new collection called 'Tutorials'"
- "Show me all completed videos"
- "Create a webhook for video.completed"
- "Update embed settings to autoplay and muted"
- "Generate a signed embed for video xyz123"
- "Create a new API key for production"
- "What's my current usage?"
- "Delete the video with ID xyz123"
- "How do I upload a video to the 'demos' collection?"

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all video collections |
| `create_collection` | Create a new collection |
| `delete_collection` | Delete a collection and its videos |
| `list_videos` | List videos (filter by collection/status) |
| `get_video` | Get video details and URLs |
| `delete_video` | Delete a video |
| `get_upload_instructions` | Get upload commands |
| `list_webhooks` | List webhooks and available events |
| `get_webhook` | Get webhook details and deliveries |
| `create_webhook` | Create a webhook (returns secret once) |
| `update_webhook` | Update a webhook |
| `test_webhook` | Send test webhook event |
| `delete_webhook` | Delete a webhook |
| `get_embed_settings` | Get embed player settings |
| `update_embed_settings` | Update embed player settings |
| `sign_embed` | Generate signed embed URL/code |
| `list_api_keys` | List API keys |
| `create_api_key` | Create API key (returns key once) |
| `delete_api_key` | Delete API key |
| `get_account` | Get account settings |
| `update_account` | Update account settings |
| `get_usage` | Get usage stats and limits |

## Resources

The server also provides documentation resources:

- `playvideo://docs/quickstart` - Quick start guide
- `playvideo://docs/api` - API reference
- `playvideo://docs/sdks` - SDK installation and examples
- `playvideo://docs/webhooks` - Webhook setup and verification

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLAYVIDEO_API_KEY` | Yes | Your PlayVideo API key |
| `PLAYVIDEO_URL` | No | API URL (default: https://api.playvideo.dev) |

## Self-Hosted PlayVideo

If you're running a self-hosted PlayVideo instance:

```json
{
  "mcpServers": {
    "playvideo": {
      "command": "playvideo-mcp",
      "env": {
        "PLAYVIDEO_API_KEY": "your-key",
        "PLAYVIDEO_URL": "https://video.yourdomain.com"
      }
    }
  }
}
```

## Security

- API keys are never logged or exposed in responses
- All API calls go directly to PlayVideo servers
- No data is stored locally

## License

MIT
