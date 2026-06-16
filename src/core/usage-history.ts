/**
 * @file Credit usage history helpers for GET /billing/usage/conversations.
 */
import * as client from './client.js';
import type {
  ConversationUsageQuery,
  ConversationUsageResponse,
  UsageEntryItem,
} from './types.js';

const USAGE_CONVERSATIONS_PATH = '/billing/usage/conversations';
const MAX_PAGE_SIZE = 100;

export function buildUsageQuery(
  params: ConversationUsageQuery,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.page_no != null) {
    query.page_no = String(params.page_no);
  }
  if (params.page_size != null) {
    query.page_size = String(Math.min(params.page_size, MAX_PAGE_SIZE));
  }
  if (params.start_date) {
    query.start_date = params.start_date;
  }
  if (params.end_date) {
    query.end_date = params.end_date;
  }
  return query;
}

export async function fetchConversationUsagePage(
  params: ConversationUsageQuery = {},
): Promise<ConversationUsageResponse> {
  return client.get<ConversationUsageResponse>(
    USAGE_CONVERSATIONS_PATH,
    buildUsageQuery(params),
  );
}

export async function fetchConversationUsage(
  params: ConversationUsageQuery = {},
  options: { allPages?: boolean } = {},
): Promise<{ items: UsageEntryItem[]; total: number; pages_fetched: number }> {
  const first = await fetchConversationUsagePage({
    ...params,
    page_no: params.page_no ?? 1,
    page_size: params.page_size ?? MAX_PAGE_SIZE,
  });

  if (!options.allPages || !first.has_next) {
    return {
      items: first.items,
      total: first.total,
      pages_fetched: 1,
    };
  }

  const items = [...first.items];
  let pageNo = first.page_no + 1;
  let pagesFetched = 1;

  while (pageNo <= first.total_pages) {
    const page = await fetchConversationUsagePage({
      ...params,
      page_no: pageNo,
      page_size: params.page_size ?? MAX_PAGE_SIZE,
    });
    items.push(...page.items);
    pagesFetched += 1;
    if (!page.has_next) {
      break;
    }
    pageNo += 1;
  }

  return {
    items,
    total: first.total,
    pages_fetched: pagesFetched,
  };
}

export function filterUsageByProject(
  items: UsageEntryItem[],
  projectId: string,
): UsageEntryItem[] {
  return items.filter((item) => item.conversation?.project_id === projectId);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

export function formatSignedCredits(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }
  return String(delta);
}

export function formatGrantLabel(source: string): string {
  if (source.startsWith('subscription_webhook:booster')) {
    return 'Booster pack';
  }
  if (source.startsWith('subscription_webhook:')) {
    return 'Subscription grant';
  }
  if (source === 'welcome') {
    return 'Welcome gift';
  }
  if (source === 'new_version_experience') {
    return 'New version experience credits';
  }
  if (source === 'admin') {
    return 'Admin adjustment';
  }
  return source || 'Credits granted';
}

export function formatUsageDescription(item: UsageEntryItem): string {
  if (item.kind === 'conversation') {
    const conv = item.conversation;
    if (conv?.user_message_hidden) {
      return 'System action';
    }
    if (conv?.user_message) {
      return truncate(conv.user_message, 60);
    }
    const tools = conv?.tool_breakdown ?? [];
    if (tools.length > 0) {
      return tools.map((t) => t.tool_key).join(', ');
    }
    return conv?.conversation_id ?? 'Conversation usage';
  }
  if (item.kind === 'grant') {
    return formatGrantLabel(item.grant?.source ?? '');
  }
  if (item.kind === 'expire') {
    return 'Credits expired';
  }
  return item.kind;
}

export function formatUsageTableRow(item: UsageEntryItem): string[] {
  const conv = item.conversation;
  return [
    new Date(item.created_at).toLocaleString(),
    item.kind,
    formatSignedCredits(item.amount_delta),
    conv?.project_id ?? '',
    conv?.session_id ?? '',
    formatUsageDescription(item),
  ];
}
