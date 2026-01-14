#!/usr/bin/env node

/**
 * PlayVideo MCP Server
 * 
 * Enables AI assistants (Claude, etc.) to manage videos via the Model Context Protocol.
 * 
 * Usage:
 * 1. Set PLAYVIDEO_API_KEY environment variable
 * 2. Add to your MCP config (e.g., claude_desktop_config.json)
 * 
 * Example config:
 * {
 *   "mcpServers": {
 *     "playvideo": {
 *       "command": "npx",
 *       "args": ["playvideo-mcp"],
 *       "env": {
 *         "PLAYVIDEO_API_KEY": "play_live_xxx"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";

// Types
interface Video {
  id: string;
  filename: string;
  status: string;
  duration?: number;
  playlistUrl?: string;
  thumbnailUrl?: string;
  collection?: { slug: string; name: string };
}

interface Collection {
  id: string;
  name: string;
  slug: string;
  videoCount: number;
  storageUsed: number;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  createdAt: string;
}

interface WebhookWithDeliveries extends Webhook {
  recentDeliveries: Array<{
    id: string;
    event: string;
    statusCode: number | null;
    error: string | null;
    attemptCount: number;
  }>;
}

interface EmbedSettings {
  allowedDomains: string[];
  allowLocalhost: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  logoPosition: string;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  key?: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Account {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  allowedDomains: string[];
  allowLocalhost: boolean;
}

interface ApiError {
  message?: string;
  error?: string;
}

// Configuration
const API_KEY = process.env.PLAYVIDEO_API_KEY;
const BASE_URL = process.env.PLAYVIDEO_URL || "https://api.playvideo.dev";

if (!API_KEY) {
  console.error("Error: PLAYVIDEO_API_KEY environment variable is required");
  process.exit(1);
}

// API helper
async function apiRequest<T>(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${BASE_URL}/api/v1${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as ApiError;
    throw new Error(`API error: ${errorData.message || errorData.error || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// Create MCP server
const server = new Server(
  {
    name: "playvideo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ============================================
      // Collection Tools
      // ============================================
      {
        name: "list_collections",
        description: "List all video collections in your PlayVideo account",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "create_collection",
        description: "Create a new video collection to organize your videos",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Name for the collection (1-100 characters)",
            },
            description: {
              type: "string",
              description: "Optional description for the collection",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "delete_collection",
        description: "Delete a collection and all its videos",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: {
              type: "string",
              description: "The collection slug to delete",
            },
          },
          required: ["slug"],
        },
      },

      // ============================================
      // Video Tools
      // ============================================
      {
        name: "list_videos",
        description: "List videos, optionally filtered by collection or status",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: {
              type: "string",
              description: "Filter by collection slug",
            },
            status: {
              type: "string",
              enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
              description: "Filter by video status",
            },
            limit: {
              type: "number",
              description: "Number of results (max 100)",
            },
          },
        },
      },
      {
        name: "get_video",
        description: "Get details for a specific video including playback URLs",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The video ID",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_video",
        description: "Delete a video",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The video ID to delete",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "get_upload_instructions",
        description: "Get instructions for uploading a video (file uploads require external tools like curl or SDK)",
        inputSchema: {
          type: "object" as const,
          properties: {
            collection: {
              type: "string",
              description: "The collection slug to upload to",
            },
          },
          required: ["collection"],
        },
      },

      // ============================================
      // Webhook Tools
      // ============================================
      {
        name: "list_webhooks",
        description: "List all webhooks configured for your account (requires PRO or BUSINESS plan)",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "get_webhook",
        description: "Get webhook details including recent delivery history",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The webhook ID",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_webhook",
        description: "Create a new webhook to receive event notifications. IMPORTANT: The secret is only returned once - save it securely!",
        inputSchema: {
          type: "object" as const,
          properties: {
            url: {
              type: "string",
              description: "The HTTPS URL to receive webhook events",
            },
            events: {
              type: "array",
              items: {
                type: "string",
                enum: ["video.uploaded", "video.processing", "video.completed", "video.failed", "collection.created", "collection.deleted"],
              },
              description: "Events to subscribe to",
            },
          },
          required: ["url", "events"],
        },
      },
      {
        name: "update_webhook",
        description: "Update a webhook's URL, events, or active status",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The webhook ID to update",
            },
            url: {
              type: "string",
              description: "New URL for the webhook",
            },
            events: {
              type: "array",
              items: { type: "string" },
              description: "New events to subscribe to",
            },
            isActive: {
              type: "boolean",
              description: "Enable or disable the webhook",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "test_webhook",
        description: "Send a test event to a webhook to verify it's working",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The webhook ID to test",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_webhook",
        description: "Delete a webhook",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The webhook ID to delete",
            },
          },
          required: ["id"],
        },
      },

      // ============================================
      // Embed Tools
      // ============================================
      {
        name: "get_embed_settings",
        description: "Get current embed player settings (colors, controls, behavior)",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "update_embed_settings",
        description: "Update embed player settings",
        inputSchema: {
          type: "object" as const,
          properties: {
            primaryColor: {
              type: "string",
              description: "Primary color (hex, e.g., #FF0000)",
            },
            accentColor: {
              type: "string",
              description: "Accent color (hex)",
            },
            autoplay: {
              type: "boolean",
              description: "Auto-play videos",
            },
            muted: {
              type: "boolean",
              description: "Start muted",
            },
            loop: {
              type: "boolean",
              description: "Loop videos",
            },
            allowLocalhost: {
              type: "boolean",
              description: "Allow embedding on localhost",
            },
            allowedDomains: {
              type: "array",
              items: { type: "string" },
              description: "Domains allowed to embed videos",
            },
          },
        },
      },
      {
        name: "sign_embed",
        description: "Generate a signed embed URL and HTML code for a video",
        inputSchema: {
          type: "object" as const,
          properties: {
            videoId: {
              type: "string",
              description: "The video ID to embed",
            },
          },
          required: ["videoId"],
        },
      },

      // ============================================
      // API Key Tools
      // ============================================
      {
        name: "list_api_keys",
        description: "List all API keys for your account",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "create_api_key",
        description: "Create a new API key. IMPORTANT: The full key is only returned once - save it securely!",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Name for the API key (e.g., 'Production Server')",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "delete_api_key",
        description: "Delete an API key (cannot delete the key currently in use)",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description: "The API key ID to delete",
            },
          },
          required: ["id"],
        },
      },

      // ============================================
      // Account Tools
      // ============================================
      {
        name: "get_account",
        description: "Get account information including plan and settings",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "update_account",
        description: "Update account settings",
        inputSchema: {
          type: "object" as const,
          properties: {
            allowedDomains: {
              type: "array",
              items: { type: "string" },
              description: "Domains allowed to access your videos",
            },
            allowLocalhost: {
              type: "boolean",
              description: "Allow access from localhost",
            },
          },
        },
      },

      // ============================================
      // Usage Tools
      // ============================================
      {
        name: "get_usage",
        description: "Get current usage statistics and plan limits",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;
  const typedArgs = (args || {}) as Record<string, unknown>;

  try {
    switch (name) {
      // ============================================
      // Collection Handlers
      // ============================================
      case "list_collections": {
        const result = await apiRequest<{ collections: Collection[] }>("GET", "/collections");
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result.collections, null, 2),
          }],
        };
      }

      case "create_collection": {
        const collectionName = typedArgs.name as string;
        const description = typedArgs.description as string | undefined;
        const result = await apiRequest<Collection>("POST", "/collections", {
          name: collectionName,
          description,
        });
        return {
          content: [{
            type: "text" as const,
            text: `Collection created successfully!\n\nSlug: ${result.slug}\nName: ${result.name}`,
          }],
        };
      }

      case "delete_collection": {
        const slug = typedArgs.slug as string;
        await apiRequest<{ message: string }>("DELETE", `/collections/${encodeURIComponent(slug)}`);
        return {
          content: [{
            type: "text" as const,
            text: `Collection "${slug}" deleted successfully.`,
          }],
        };
      }

      // ============================================
      // Video Handlers
      // ============================================
      case "list_videos": {
        const collection = typedArgs.collection as string | undefined;
        const status = typedArgs.status as string | undefined;
        const limit = typedArgs.limit as number | undefined;
        
        const params = new URLSearchParams();
        if (collection) params.set("collection", collection);
        if (status) params.set("status", status);
        if (limit) params.set("limit", String(limit));

        const endpoint = `/videos${params.toString() ? `?${params}` : ""}`;
        const result = await apiRequest<{ videos: Video[] }>("GET", endpoint);

        const videoList = result.videos
          .map((v) => `- ${v.filename} (${v.status})${v.playlistUrl ? `\n  URL: ${v.playlistUrl}` : ""}`)
          .join("\n");

        return {
          content: [{
            type: "text" as const,
            text: result.videos.length > 0
              ? `Found ${result.videos.length} videos:\n\n${videoList}`
              : "No videos found.",
          }],
        };
      }

      case "get_video": {
        const id = typedArgs.id as string;
        const video = await apiRequest<Video>("GET", `/videos/${encodeURIComponent(id)}`);

        return {
          content: [{
            type: "text" as const,
            text: `Video Details:
              
ID: ${video.id}
Filename: ${video.filename}
Status: ${video.status}
Duration: ${video.duration ? `${video.duration}s` : "N/A"}
Collection: ${video.collection?.name || "N/A"}

URLs:
- Playlist (HLS): ${video.playlistUrl || "Not ready"}
- Thumbnail: ${video.thumbnailUrl || "Not ready"}`,
          }],
        };
      }

      case "delete_video": {
        const id = typedArgs.id as string;
        await apiRequest<{ message: string }>("DELETE", `/videos/${encodeURIComponent(id)}`);
        return {
          content: [{
            type: "text" as const,
            text: `Video "${id}" deleted successfully.`,
          }],
        };
      }

      case "get_upload_instructions": {
        const collection = typedArgs.collection as string;

        return {
          content: [{
            type: "text" as const,
            text: `To upload a video to the "${collection}" collection:

## Using curl:
\`\`\`bash
curl -X POST ${BASE_URL}/api/v1/videos \\
  -H "Authorization: Bearer \${PLAYVIDEO_API_KEY}" \\
  -F "file=@/path/to/video.mp4" \\
  -F "collection=${collection}"
\`\`\`

## Using the JavaScript SDK:
\`\`\`javascript
import PlayVideo from 'playvideo';
const client = new PlayVideo(process.env.PLAYVIDEO_API_KEY);
const result = await client.videos.uploadFile('./video.mp4', '${collection}');
\`\`\`

## Using the Python SDK:
\`\`\`python
from playvideo import PlayVideo
client = PlayVideo(os.environ["PLAYVIDEO_API_KEY"])
result = client.videos.upload("./video.mp4", "${collection}")
\`\`\`

After uploading, use the get_video tool to check processing status.`,
          }],
        };
      }

      // ============================================
      // Webhook Handlers
      // ============================================
      case "list_webhooks": {
        const result = await apiRequest<{ webhooks: Webhook[]; availableEvents: string[] }>("GET", "/webhooks");
        return {
          content: [{
            type: "text" as const,
            text: `Webhooks:\n${JSON.stringify(result.webhooks, null, 2)}\n\nAvailable events: ${result.availableEvents.join(", ")}`,
          }],
        };
      }

      case "get_webhook": {
        const id = typedArgs.id as string;
        const webhook = await apiRequest<WebhookWithDeliveries>("GET", `/webhooks/${encodeURIComponent(id)}`);
        
        const deliveries = webhook.recentDeliveries
          .map((d) => `  - ${d.event}: ${d.statusCode || "pending"} (attempts: ${d.attemptCount})`)
          .join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `Webhook Details:

ID: ${webhook.id}
URL: ${webhook.url}
Active: ${webhook.isActive}
Events: ${webhook.events.join(", ")}

Recent Deliveries:
${deliveries || "  No recent deliveries"}`,
          }],
        };
      }

      case "create_webhook": {
        const url = typedArgs.url as string;
        const events = typedArgs.events as string[];
        
        const result = await apiRequest<{ webhook: Webhook & { secret: string } }>("POST", "/webhooks", { url, events });
        
        return {
          content: [{
            type: "text" as const,
            text: `Webhook created successfully!

ID: ${result.webhook.id}
URL: ${result.webhook.url}
Events: ${result.webhook.events.join(", ")}

SECRET: ${result.webhook.secret}

IMPORTANT: Save this secret securely! It won't be shown again.
Use it to verify webhook signatures.`,
          }],
        };
      }

      case "update_webhook": {
        const id = typedArgs.id as string;
        const updates: Record<string, unknown> = {};
        if (typedArgs.url) updates.url = typedArgs.url;
        if (typedArgs.events) updates.events = typedArgs.events;
        if (typedArgs.isActive !== undefined) updates.isActive = typedArgs.isActive;

        const result = await apiRequest<Webhook>("PATCH", `/webhooks/${encodeURIComponent(id)}`, updates);
        return {
          content: [{
            type: "text" as const,
            text: `Webhook updated!\n\nURL: ${result.url}\nActive: ${result.isActive}\nEvents: ${result.events.join(", ")}`,
          }],
        };
      }

      case "test_webhook": {
        const id = typedArgs.id as string;
        const result = await apiRequest<{ message: string; statusCode?: number; error?: string }>(
          "POST",
          `/webhooks/${encodeURIComponent(id)}/test`,
          {}
        );
        return {
          content: [{
            type: "text" as const,
            text: result.error
              ? `Webhook test failed: ${result.error} (status: ${result.statusCode})`
              : `Webhook test successful! Status: ${result.statusCode}`,
          }],
        };
      }

      case "delete_webhook": {
        const id = typedArgs.id as string;
        await apiRequest<{ message: string }>("DELETE", `/webhooks/${encodeURIComponent(id)}`);
        return {
          content: [{
            type: "text" as const,
            text: `Webhook "${id}" deleted successfully.`,
          }],
        };
      }

      // ============================================
      // Embed Handlers
      // ============================================
      case "get_embed_settings": {
        const settings = await apiRequest<EmbedSettings>("GET", "/embed/settings");
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(settings, null, 2),
          }],
        };
      }

      case "update_embed_settings": {
        const updates: Record<string, unknown> = {};
        const fields = ["primaryColor", "accentColor", "autoplay", "muted", "loop", "allowLocalhost", "allowedDomains"];
        for (const field of fields) {
          if (typedArgs[field] !== undefined) {
            updates[field] = typedArgs[field];
          }
        }

        const result = await apiRequest<{ settings: EmbedSettings }>("PATCH", "/embed/settings", updates);
        return {
          content: [{
            type: "text" as const,
            text: `Embed settings updated!\n\n${JSON.stringify(result.settings, null, 2)}`,
          }],
        };
      }

      case "sign_embed": {
        const videoId = typedArgs.videoId as string;
        const result = await apiRequest<{
          embedUrl: string;
          embedCode: { responsive: string; fixed: string };
        }>("POST", "/embed/sign", { videoId });

        return {
          content: [{
            type: "text" as const,
            text: `Embed URL: ${result.embedUrl}

Responsive HTML:
${result.embedCode.responsive}

Fixed Size HTML:
${result.embedCode.fixed}`,
          }],
        };
      }

      // ============================================
      // API Key Handlers
      // ============================================
      case "list_api_keys": {
        const result = await apiRequest<{ apiKeys: ApiKey[] }>("GET", "/api-keys");
        const keyList = result.apiKeys
          .map((k) => `- ${k.name} (${k.keyPrefix}...) - Last used: ${k.lastUsedAt || "Never"}`)
          .join("\n");
        return {
          content: [{
            type: "text" as const,
            text: `API Keys:\n\n${keyList || "No API keys found."}`,
          }],
        };
      }

      case "create_api_key": {
        const keyName = typedArgs.name as string;
        const result = await apiRequest<{ apiKey: ApiKey & { key: string } }>("POST", "/api-keys", { name: keyName });
        return {
          content: [{
            type: "text" as const,
            text: `API Key created!

Name: ${result.apiKey.name}
Key: ${result.apiKey.key}

IMPORTANT: Save this key securely! It won't be shown again.`,
          }],
        };
      }

      case "delete_api_key": {
        const id = typedArgs.id as string;
        await apiRequest<{ message: string }>("DELETE", `/api-keys/${encodeURIComponent(id)}`);
        return {
          content: [{
            type: "text" as const,
            text: `API key "${id}" deleted successfully.`,
          }],
        };
      }

      // ============================================
      // Account Handlers
      // ============================================
      case "get_account": {
        const account = await apiRequest<Account>("GET", "/account");
        return {
          content: [{
            type: "text" as const,
            text: `Account Details:

Email: ${account.email}
Name: ${account.name || "Not set"}
Plan: ${account.plan}
Allowed Domains: ${account.allowedDomains.length > 0 ? account.allowedDomains.join(", ") : "None"}
Allow Localhost: ${account.allowLocalhost}`,
          }],
        };
      }

      case "update_account": {
        const updates: Record<string, unknown> = {};
        if (typedArgs.allowedDomains !== undefined) updates.allowedDomains = typedArgs.allowedDomains;
        if (typedArgs.allowLocalhost !== undefined) updates.allowLocalhost = typedArgs.allowLocalhost;

        const result = await apiRequest<{ account: Account }>("PATCH", "/account", updates);
        return {
          content: [{
            type: "text" as const,
            text: `Account updated!\n\nAllowed Domains: ${result.account.allowedDomains.join(", ") || "None"}\nAllow Localhost: ${result.account.allowLocalhost}`,
          }],
        };
      }

      // ============================================
      // Usage Handler
      // ============================================
      case "get_usage": {
        const usage = await apiRequest<{
          plan: string;
          usage: {
            videosThisMonth: number;
            videosLimit: number | "unlimited";
            storageUsedGB: string;
            storageLimitGB: number;
          };
          limits: {
            maxFileSizeMB: number;
            maxDurationMinutes: number;
            webhooks: boolean;
          };
        }>("GET", "/usage");

        return {
          content: [{
            type: "text" as const,
            text: `Plan: ${usage.plan}

Usage:
- Videos this month: ${usage.usage.videosThisMonth} / ${usage.usage.videosLimit}
- Storage: ${usage.usage.storageUsedGB} GB / ${usage.usage.storageLimitGB} GB

Limits:
- Max file size: ${usage.limits.maxFileSizeMB} MB
- Max duration: ${usage.limits.maxDurationMinutes} minutes
- Webhooks: ${usage.limits.webhooks ? "Enabled" : "Disabled"}`,
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }],
      isError: true,
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "playvideo://docs/quickstart",
        mimeType: "text/markdown",
        name: "Quick Start Guide",
        description: "How to get started with PlayVideo API",
      },
      {
        uri: "playvideo://docs/api",
        mimeType: "text/markdown",
        name: "API Reference",
        description: "Complete API documentation",
      },
      {
        uri: "playvideo://docs/sdks",
        mimeType: "text/markdown",
        name: "SDK Installation",
        description: "How to install and use PlayVideo SDKs",
      },
      {
        uri: "playvideo://docs/webhooks",
        mimeType: "text/markdown",
        name: "Webhooks Guide",
        description: "How to set up and verify webhooks",
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
  const { uri } = request.params;

  if (uri === "playvideo://docs/quickstart") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# PlayVideo Quick Start

## 1. Create a Collection

Collections organize your videos. Create one per project:

\`\`\`bash
curl -X POST ${BASE_URL}/api/v1/collections \\
  -H "Authorization: Bearer play_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My App Videos"}'
\`\`\`

## 2. Upload a Video

\`\`\`bash
curl -X POST ${BASE_URL}/api/v1/videos \\
  -H "Authorization: Bearer play_live_xxx" \\
  -F "file=@video.mp4" \\
  -F "collection=my_app_videos"
\`\`\`

## 3. Check Status & Get Stream URL

\`\`\`bash
curl ${BASE_URL}/api/v1/videos/VIDEO_ID \\
  -H "Authorization: Bearer play_live_xxx"
\`\`\`

The response includes \`playlistUrl\` (HLS stream) when processing is complete.

## 4. Embed the Video

Use the embed API to get embed codes, or play directly with any HLS player.
`,
      }],
    };
  }

  if (uri === "playvideo://docs/api") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# PlayVideo API Reference

Base URL: ${BASE_URL}/api/v1

## Authentication

All requests require: \`Authorization: Bearer play_live_xxx\`

## Endpoints

### Collections
- \`GET /collections\` - List collections
- \`POST /collections\` - Create collection
- \`GET /collections/:slug\` - Get collection with videos
- \`DELETE /collections/:slug\` - Delete collection

### Videos
- \`GET /videos\` - List videos
- \`POST /videos\` - Upload video (multipart/form-data)
- \`GET /videos/:id\` - Get video
- \`DELETE /videos/:id\` - Delete video
- \`GET /videos/:id/embed\` - Get embed info
- \`GET /videos/:id/progress\` - SSE stream for processing progress

### Webhooks (PRO/BUSINESS)
- \`GET /webhooks\` - List webhooks
- \`POST /webhooks\` - Create webhook
- \`GET /webhooks/:id\` - Get webhook with deliveries
- \`PATCH /webhooks/:id\` - Update webhook
- \`POST /webhooks/:id/test\` - Test webhook
- \`DELETE /webhooks/:id\` - Delete webhook

### Embed
- \`GET /embed/settings\` - Get embed settings
- \`PATCH /embed/settings\` - Update embed settings
- \`POST /embed/sign\` - Generate signed embed URL

### API Keys
- \`GET /api-keys\` - List API keys
- \`POST /api-keys\` - Create API key
- \`DELETE /api-keys/:id\` - Delete API key

### Account
- \`GET /account\` - Get account info
- \`PATCH /account\` - Update account

### Usage
- \`GET /usage\` - Get usage stats and limits
`,
      }],
    };
  }

  if (uri === "playvideo://docs/sdks") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# PlayVideo SDKs

Official SDKs are available for multiple languages:

## JavaScript/TypeScript

\`\`\`bash
npm install playvideo
\`\`\`

\`\`\`typescript
import PlayVideo from 'playvideo';

const client = new PlayVideo('play_live_xxx');

// Upload a video
const result = await client.videos.uploadFile('./video.mp4', 'my-collection');

// Watch processing progress
for await (const event of client.videos.watchProgress(result.video.id)) {
  console.log(event.stage, event.message);
  if (event.stage === 'completed') break;
}
\`\`\`

## Python

\`\`\`bash
pip install playvideo
\`\`\`

\`\`\`python
from playvideo import PlayVideo

client = PlayVideo("play_live_xxx")

# Upload a video
result = client.videos.upload("./video.mp4", "my-collection")

# Watch processing progress
for event in client.videos.watch_progress(result.video["id"]):
    print(event.stage, event.message)
    if event.stage == "completed":
        break
\`\`\`

## PHP

\`\`\`bash
composer require playvideo/playvideo
\`\`\`

\`\`\`php
use PlayVideo\\PlayVideo;

$client = new PlayVideo('play_live_xxx');

// Upload a video
$result = $client->videos->upload('./video.mp4', 'my-collection');

// Watch processing progress
foreach ($client->videos->watchProgress($result['video']['id']) as $event) {
    echo $event->stage . ': ' . $event->message . PHP_EOL;
    if ($event->stage === 'completed') break;
}
\`\`\`

## Go

\`\`\`bash
go get github.com/PlayVideo-dev/playvideo-go
\`\`\`

\`\`\`go
import "github.com/PlayVideo-dev/playvideo-go"

client := playvideo.NewClient("play_live_xxx")

// Upload a video
result, _ := client.Videos.UploadFile(ctx, "./video.mp4", "my-collection", nil)

// Watch processing progress
events, errs := client.Videos.WatchProgress(ctx, result.Video.ID)
for event := range events {
    fmt.Println(event.Stage, event.Message)
    if event.Stage == playvideo.ProgressStageCompleted {
        break
    }
}
\`\`\`

## GitHub Repositories

- JavaScript: https://github.com/PlayVideo-dev/playvideo-js
- Python: https://github.com/PlayVideo-dev/playvideo-python
- PHP: https://github.com/PlayVideo-dev/playvideo-php
- Go: https://github.com/PlayVideo-dev/playvideo-go
`,
      }],
    };
  }

  if (uri === "playvideo://docs/webhooks") {
    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: `# PlayVideo Webhooks

Webhooks allow you to receive real-time notifications when events occur.

## Available Events

- \`video.uploaded\` - Video upload started
- \`video.processing\` - Video processing started
- \`video.completed\` - Video processing completed
- \`video.failed\` - Video processing failed
- \`collection.created\` - Collection created
- \`collection.deleted\` - Collection deleted

## Creating a Webhook

\`\`\`bash
curl -X POST ${BASE_URL}/api/v1/webhooks \\
  -H "Authorization: Bearer play_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["video.completed", "video.failed"]
  }'
\`\`\`

**IMPORTANT**: Save the \`secret\` from the response - it's only shown once!

## Verifying Signatures

All webhook requests include these headers:
- \`X-PlayVideo-Signature\`: HMAC-SHA256 signature (sha256=...)
- \`X-PlayVideo-Timestamp\`: Unix timestamp in milliseconds

### JavaScript
\`\`\`javascript
import { verifyWebhookSignature } from 'playvideo/webhooks';

app.post('/webhook', async (req, res) => {
  const isValid = await verifyWebhookSignature(
    req.body,
    req.headers['x-playvideo-signature'],
    req.headers['x-playvideo-timestamp'],
    'whsec_xxx'
  );
});
\`\`\`

### Python
\`\`\`python
from playvideo.webhook import verify_signature

@app.route('/webhook', methods=['POST'])
def webhook():
    verify_signature(
        request.data,
        request.headers['X-PlayVideo-Signature'],
        request.headers['X-PlayVideo-Timestamp'],
        'whsec_xxx'
    )
\`\`\`

## Webhook Payload

\`\`\`json
{
  "event": "video.completed",
  "timestamp": 1705123456789,
  "data": {
    "id": "vid_xxx",
    "filename": "video.mp4",
    "status": "COMPLETED",
    "playlistUrl": "https://cdn.playvideo.dev/..."
  }
}
\`\`\`
`,
      }],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PlayVideo MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
