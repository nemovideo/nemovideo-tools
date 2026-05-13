// ── Gateway API response envelope ──

export interface GatewayResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// ── Auth ──

export interface VerifyTokenResponse {
  user_id: string;
  email?: string;
  balance?: number;
}

// ── Projects ──

export interface Project {
  project_id: string;
  user_id: string;
  name?: string | null;
  cover_assets?: unknown[];
  session?: unknown | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface CreateProjectRequest {
  create_session: boolean;
  name?: string;
}

export interface CreateProjectSession {
  session_id: string;
  project_id: string;
  status?: string;
}

export interface CreateProjectResponse {
  project_id: string;
  user_id: string;
  session?: CreateProjectSession | null;
}

export interface Session {
  session_id: string;
  project_id: string;
  name?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

export interface SessionsResponse {
  sessions: Session[];
}

// ── State ──

export interface FrontendState {
  project?: Record<string, unknown>;
  version?: number;
  projectName?: string;
  [key: string]: unknown;
}

// ── Render ──

export interface RenderSubmitRequest {
  project_id: string;
  draft: Record<string, unknown>;
}

export interface RenderSubmitResponse {
  render_id: string;
  status: string;
}

export interface RenderStatusResponse {
  render_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output?: {
    url: string;
    duration?: number;
    size?: number;
  };
  error?: string;
}

// ── Billing ──

export interface BalanceResponse {
  available: number;
  frozen: number;
  total_granted: number;
  total_consumed: number;
}

export interface UsageRecord {
  id: string;
  type: string;
  credits: number;
  description?: string;
  created_at: string;
}

export interface UsageHistoryResponse {
  records: UsageRecord[];
  total: number;
}

// ── Files ──

export interface UploadResponse {
  file_id: string;
  filename: string;
  url: string;
}

// ── Auth Exchange ──

export interface ExchangeClaimTokenResponse {
  claim_token: string;
}

// ── WebSocket message types ──

export type WSClientMessageType = 'message' | 'ping' | 'abort';

export interface WSClientMessage {
  type: WSClientMessageType;
  content?: string;
  metadata?: Record<string, unknown>;
}

export type WSServerMessageType =
  | 'session_ready'
  | 'warming_up'
  | 'status'
  | 'message_accepted'
  | 'chunk'
  | 'text'
  | 'thinking_start'
  | 'thinking_chunk'
  | 'thinking_end'
  | 'tool_start'
  | 'tool_end'
  | 'toolcall_start'
  | 'toolcall_end'
  | 'ask_question'
  | 'done'
  | 'pong'
  | 'error';

export interface AskQuestionOption {
  id: string;
  label: string;
}

export interface AskQuestion {
  id: string;
  prompt: string;
  options: AskQuestionOption[];
  allow_multiple?: boolean;
}

export interface WSServerMessage {
  type: WSServerMessageType;
  session_id?: string;
  text?: string;
  error?: string;
  status?: string;
  sandbox_id?: string;
  client_message_id?: string;
  title?: string;
  questions?: AskQuestion[];
  [key: string]: unknown;
}

// ── Config schema ──

export interface CLIConfig {
  api_key: string;
  base_url: string;
  output_dir: string;
}

// ── CLI command options ──

export interface CreateOptions {
  prompt: string;
  duration?: number;
  ratio?: string;
  export?: boolean;
  output?: string;
}

export interface ChatOptions {
  prompt: string;
}

export interface ExportOptions {
  output?: string;
}

export interface UploadOptions {
  project: string;
}

export interface ProjectDownloadOptions {
  output?: string;
}
