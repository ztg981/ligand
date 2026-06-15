import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, context } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    let systemInstruction = "";
    let prompt = "";

    // The core Ligand philosophy for AI
    const basePhilosophy = "You are Ligand, a gentle productivity assistant for users with ADHD. You are encouraging, never shaming, and forgiving of inconsistency. Keep your response to EXACTLY 1 complete sentence (around 12-28 words). No markdown formatting, no bullet points, no quotes, just plain text. Never use vague standalone phrases like 'It's okay', 'Keep going', 'You got this', or 'You're doing great'.";

    if (action === "goal-summary") {
      systemInstruction = `${basePhilosophy} Summarize the goal progress gently and suggest one tiny, specific next step based on the provided context.`;
      prompt = `Goal: ${context.name}\nTarget Date: ${context.targetDate || "None"}\nRecent Tasks: ${JSON.stringify(context.tasks)}\nRecent Habits: ${JSON.stringify(context.habits)}\nWrite 1 complete sentence summarizing progress and suggesting a specific tiny next step.`;
    } else if (action === "overdue-advice") {
      systemInstruction = `${basePhilosophy} The user is reviewing an overdue goal. Suggest gently whether they might want to revise the date, archive it, or keep going.`;
      prompt = `Goal: ${context.name}\nTarget Date: ${context.targetDate}\nRecent Activity: ${context.activitySummary}\nWrite 1 complete sentence of advice on what to do with this goal.`;
    } else if (action === "journal-prompt") {
      systemInstruction = `${basePhilosophy} Generate exactly ONE short, gentle journaling reflection prompt based on the user's current goal context.`;
      prompt = `Goal: ${context.name}\nRecent Tasks: ${JSON.stringify(context.tasks)}\nWrite 1 complete sentence that acts as a reflection prompt.`;
    } else {
      throw new Error("Invalid action provided.");
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Gemini API Error:", errorData);
      throw new Error("Failed to fetch from Gemini API.");
    }

    const data = await res.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(JSON.stringify({ result: generatedText.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
