import { jsonSchema, tool } from 'ai';

import {
  searchMemory,
  getRecentSessions,
  getSessionDetails,
  getDomainActivity,
} from '@/lib/memory/queries/index';

export function createMemoryTools() {
  return {
    search_memory: tool({
      description:
        "Search the user's recent browsing sessions and visits by keyword, topic, or domain.",
      inputSchema: jsonSchema<{ query: string; limit?: number }>({
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1 },
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
      }),
      execute: async (input) => {
        const result = await searchMemory(input);
        return {
          summary: result.summary,
          confidence: result.sessions.length > 0 ? 0.9 : 0.2,
          items: result.sessions,
        };
      },
    }),
    get_recent_sessions: tool({
      description:
        'See exactly what the user was doing recently by fetching the latest browsing sessions.',
      inputSchema: jsonSchema<{ limit?: number }>({
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
      }),
      execute: async (input) => {
        const result = await getRecentSessions(input);
        return {
          summary: result.summary,
          confidence: 0.95,
          items: result.sessions,
        };
      },
    }),
    get_session_details: tool({
      description:
        'Drill down into a specific session to see every exact URL, title, and timestamp visited.',
      inputSchema: jsonSchema<{ sessionId: string }>({
        type: 'object',
        additionalProperties: false,
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', minLength: 1 },
        },
      }),
      execute: async (input) => {
        const result = await getSessionDetails(input);
        return {
          summary: result.summary,
          confidence: result.session ? 1.0 : 0.0,
          session: result.session,
          insight: result.insight,
        };
      },
    }),
    get_domain_activity: tool({
      description: 'See all recent activity on a specific site (e.g., "github.com", "tauri.app").',
      inputSchema: jsonSchema<{ domain: string; limit?: number }>({
        type: 'object',
        additionalProperties: false,
        required: ['domain'],
        properties: {
          domain: { type: 'string', minLength: 1 },
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
      }),
      execute: async (input) => {
        const result = await getDomainActivity(input);
        return {
          summary: result.summary,
          confidence: result.sessions.length > 0 ? 0.85 : 0.2,
          items: result.sessions,
        };
      },
    }),
  };
}
