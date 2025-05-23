import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import type { ChatCompletionMessageParam, ChatModel } from "openai/resources/index.mjs";
import { systemPrompt } from "./systemprompt";
import OpenAI from "openai/index.mjs";

interface EnvironmentVariables {
  OPENAI_POWERTROLL_API_KEY: { get(): Promise<string> };
  OPENAI_ORG_ID: string;
  OPENAI_PROJECT_ID: string;
}

let openai: OpenAI | null = null;
async function getOpenAI(env: EnvironmentVariables) {
  if (!openai) {
    openai = new OpenAI({
      apiKey: await env.OPENAI_POWERTROLL_API_KEY.get(),
      organization: env.OPENAI_ORG_ID,
      project: env.OPENAI_PROJECT_ID,
    });
  }
  return openai;
}

export default {
  async fetch(request: Request, env: EnvironmentVariables): Promise<Response> {
    console.log(env);
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") {
      return Response.redirect("https://jacklehamster.github.io/api.dobuki.net/icon.png");
    }

    //FORMAT:
    //        const response = await fetch(`${OPEN_AI_URL}?dictionary=${JSON.stringify(dico)}&situation=${HumanEvent.LANG}.${situation}&seed=${seed ?? ""}${customFieldsParams}`);
    if (url.pathname === "/comment") {
      const openai = await getOpenAI(env);
      const query: any = {};
      url.searchParams.entries().forEach(([key, value]) => {
        query[key] = value;
      });

      const { situation, model, seed, dictionary, jsonp, ...customFields } = query;
      let situations = ((situation ?? "") as string).split(".");
      const cf: Record<string, { type: string; value: any }> = {};
      Object.entries(customFields).forEach(([kString, value]) => {
        const [key, type] = kString.split(":");
        cf[key] = {
          type,
          value,
        };
      });
      const response = await makeComment(openai,
        situations, model as ChatModel, seed, dictionary ? JSON.parse(dictionary) : undefined,
        cf
      );
      const formattedResponse = typeof (response) === "object" ? response : {
        response,
      };
      const jsonResponse = JSON.stringify(formattedResponse);
      if (jsonp) {
        return new Response(`${jsonp}(${jsonResponse})`, {
          headers: { "Content-Type": "text/javascript" },
        });
      } else {
        return new Response(jsonResponse, {
          headers: { "Content-Type": "application/json" },
        });
      }
    }



    return new Response("<a href='https://github.com/jacklehamster/api.dobuki.net'>Hello, World!</a>", {
      headers: { "Content-Type": "text/html" },
    });
  },
};


const CHAT_MODEL: ChatModel = "gpt-4o-mini";

async function makeComment(
  openai: OpenAI,
  situations: string[],
  model: string = CHAT_MODEL,
  seed?: string,
  dictionary?: Record<string, string>,
  customFields?: Record<string, {
    type?: string;
    value: string | number | boolean;
  }>,
) {
  const sit = situations.map(s => s.trim())
    .map(s => dictionary ? dictionary[s] ?? "" : s)
    .map(s => {
      if (!customFields) {
        return s;
      }
      Object.entries(customFields).forEach(([key, field]) => {
        s = s.replaceAll(`<${key}>`, field.value.toString());
      });
      return s;
    });

  const res = await comment(openai, {
    model: openai.baseURL === "https://api.deepseek.com" ? "deepseek-chat" : model,
    messages: sit.map((situation) => {
      return {
        role: 'user',
        content: situation,
      };
    }),
    params: {
      seed: parseInt(seed ?? "0"),
    }
  });
  const response = res.choices[0].message.content;
  return {
    model: res.model,
    response,
    ...(dictionary ? { situations } : {}),
  };
}

interface Props {
  model: ChatCompletionCreateParamsBase["model"];
  params?: Partial<ChatCompletionCreateParamsBase>;
  messages?: ChatCompletionMessageParam[];
}

export async function comment(
  openai: OpenAI,
  {
    model,
    params = {
      seed: 0,
    },
    messages = []
  }: Props) {
  const systemText = systemPrompt;

  const allMessages: ChatCompletionMessageParam[] = [
    {
      "role": "system",
      "content": systemText,
    },
    ...messages,
  ];

  const response = await openai.chat.completions.create({
    model,
    messages: allMessages,
    temperature: params?.temperature ?? 1,
    top_p: params?.top_p ?? 1,
    frequency_penalty: params?.frequency_penalty ?? 0,
    presence_penalty: params?.presence_penalty ?? 0,
  }, {
  });

  return response;
}
