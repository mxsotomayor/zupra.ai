export type HTTPMethod = "POST" | "GET";

export interface LLMCompletionResponse {
    model: string;
    created_at: Date;
  
    response: string;
    message: { role: string; content: string }; // used by ollama
  
    done: boolean;
    done_reason?: string;
    context?: Array<number | string>;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
  }

export interface IChunkedResponseReaderHandlers {
    verbose?: boolean;
    whileReadingCB: (data: LLMCompletionResponse) => void;
    handleReadingErrorCB?: (errMsg: string) => void;
    startReadingCB?: (data: LLMCompletionResponse) => void;
    endReadingCB?: (data?: LLMCompletionResponse) => void;
    closeReadingCB?: () => void;
  }