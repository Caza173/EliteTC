import OpenAI from "openai";

// Lazy client so the module imports cleanly when OPENAI_API_KEY is unset
// (e.g. local dev without a key, CI builds, or AWS startup before secret
// injection). Throwing here at import time would crash the whole server.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

const PARSING_MODEL = process.env.OPENAI_PARSE_MODEL || "gpt-4o-mini";

export interface ParsedContractFields {
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  buyerNames?: string[];
  sellerNames?: string[];
  contractDate?: string;
  closingDate?: string;
  salePriceUsd?: number;
  earnestMoneyUsd?: number;
  inspectionDeadline?: string;
  financingDeadline?: string;
  appraisalDeadline?: string;
  warnings?: string[];
}

const SYSTEM_PROMPT = `You extract structured fields from a US real-estate purchase agreement
or addendum. Return ONLY valid JSON conforming to the ParsedContractFields schema.
Dates must be ISO-8601 (YYYY-MM-DD). Money values are USD as numbers.
If a field is not present in the text, omit it. Do not invent values.`;

export async function parseContractText(rawText: string): Promise<ParsedContractFields> {
  const trimmed = rawText.slice(0, 60_000);
  const completion = await getClient().chat.completions.create({
    model: PARSING_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract fields from the following contract text:\n\n${trimmed}`,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as ParsedContractFields;
  } catch {
    return { warnings: ["OpenAI response was not valid JSON"] };
  }
}
