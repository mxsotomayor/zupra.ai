import { IChunkedResponseReaderHandlers, LLMCompletionResponse } from "./models/schemas";

class ChatCompletionContentBuilder {

  providersMappers: Record<string, (chunk: string[], stream:boolean) => LLMCompletionResponse[]> = {
    open_ai(chunk: string[], stream = false): LLMCompletionResponse[] {
      return chunk.map((item: string) => {
        try {
          const data = JSON.parse(item.replace(/'/g, '"'));
  
          const content = !stream
            ? data.choices[0].message.content
            : data.choices[0].delta.content;
          const role = !stream
            ? data.choices[0].message.role
            : data.choices[0].delta.content;
  
          return {
            done: false,
            message: {
              content,
              role,
            },
          } as LLMCompletionResponse;
        } catch (e) {
          return {
            done: false,
            message: {
              content: "",
              role: "",
            },
          } as LLMCompletionResponse;
        }
      });
    }
  }

  run(
    providerName: string,
    splitted: string[],
    stream = false
  ): LLMCompletionResponse[] {
    if (typeof this.providersMappers[providerName] === "function") {
      return this.providersMappers[providerName]?.(splitted, stream);
    } else {
      throw Error("Chat completion data extractor not implemented yet");
    }
  }
}

export interface InitReaderProps {
  stream: boolean;
  prompt: string;
  collection?: string;
  provider: string;
  model: string;
}

class ChunkedResponseReader {
  url: string;

  handlers: IChunkedResponseReaderHandlers;

  reader: ReadableStreamDefaultReader | undefined;

  constructor(url: string, handlers: IChunkedResponseReaderHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  close() {
    this.reader?.cancel();
    this.handlers.closeReadingCB?.();
  }

  async init(payload: InitReaderProps) {
    await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (_res) => {
        if (!_res.ok) {
          this.handlers.handleReadingErrorCB?.(_res.statusText);
          return;
        }

        this.reader = _res.body
          ?.pipeThrough(new TextDecoderStream())
          .getReader();

        let isFirst = true;

        const mapped = new ChatCompletionContentBuilder();

        while (true) {
          const { done, value } = (await this.reader?.read()) as any;

          if (!value) {
            this.handlers.endReadingCB?.();
            this.close();
            return;
          }

          // for json line based responses
          let splittedJSONStrings: string[] = value
            .replace(/}\s*{/g, "}\n{") // device string in json lines
            .split("\n") // split lines to json array
            .map((item: string) => {
              try {
                // if can parse the json so return the string
                // else proceed to clean, remove unwanted chars an return, this should be ready to parse
                JSON.parse(item);
                return item;
              } catch (e) {
                return item
                  .replace(/"/g, "_#_")
                  .replace(/'/g, '"')
                  .replace(/_#_/g, "&quot;");
              }
            });

          if (JSON.parse(splittedJSONStrings[0]).error) {
            this.handlers.handleReadingErrorCB?.(
              JSON.parse(splittedJSONStrings[0]).error
            );
          }

          const AiEngineChatResponseList = mapped.run(
            payload.provider,
            splittedJSONStrings,
            payload.stream
          );

          if (done) {
            if (AiEngineChatResponseList.length >= 2) {
              AiEngineChatResponseList.splice(
                0,
                AiEngineChatResponseList.length - 2
              ).forEach((payload) => {
                this.handlers.whileReadingCB?.(payload);
              });
            }

            AiEngineChatResponseList.forEach((payload) => {
              this.handlers.endReadingCB?.(payload);
            });

            this.close();

            break;
          }

          if (isFirst) {
            isFirst = false;

            AiEngineChatResponseList.forEach((payload) => {
              this.handlers.startReadingCB?.(payload);
            });
          } else {
            AiEngineChatResponseList.forEach((payload) => {
              this.handlers.whileReadingCB?.(payload);
            });
          }
        }
      })
      .catch((e) => {
        this.handlers.endReadingCB?.();
        this.close();
        console.log("Error Streaming", e);
      });
  }
}

export default ChunkedResponseReader;
