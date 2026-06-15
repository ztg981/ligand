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

  let geminiStatus = 0;
  let typeReceived = "undefined";
  let extractedTextLength = 0;
  let extractedTextPreview = "";
  let generatedText = "";
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const hasGeminiKey = !!apiKey;

  try {
    const { action, context } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          text: "",
          ok: false,
          debug: {
            typeReceived,
            hasGeminiKey,
            geminiStatus,
            extractedTextLength,
            extractedTextPreview,
            error: "GEMINI_API_KEY is not set."
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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
    } else if (action === "weekly_review") {
      // Weekly review is the one multi-sentence action — its own instruction so
      // the strict 1-sentence rule for the other actions stays untouched.
      const weeklyPhilosophy = "You are Ligand, a gentle productivity assistant for users with ADHD. You are encouraging, never shaming, and forgiving of inconsistency. No markdown, no bullet points, no quotes, just plain text. Never use vague standalone phrases like 'It's okay' or 'You got this'.";
      systemInstruction = `${weeklyPhilosophy} Write 2-3 short, complete sentences reviewing the user's week: gently note what went well, mention at most one real pattern ONLY if the data clearly shows it (never invent one), and end with one small, specific suggestion for next week.`;
      prompt = `Active goals: ${JSON.stringify(context.activeGoals)}\nTasks done / total: ${context.tasksDone}/${context.tasksTotal}\nHabit check-ins this week: ${context.habitCheckInsThisWeek}\nHabit check-ins by weekday (last 4 weeks): ${JSON.stringify(context.weekdayCheckIns)}\nJournal entries this week: ${context.journalEntriesThisWeek}\nWrite a gentle 2-3 sentence weekly review based only on this data.`;
    } else {
      throw new Error("Invalid action provided.");
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    geminiStatus = res.status;

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Gemini API Error:", errorData);
      return new Response(
        JSON.stringify({
          text: "",
          ok: false,
          debug: {
            typeReceived,
            hasGeminiKey,
            geminiStatus,
            extractedTextLength,
            extractedTextPreview,
            error: `Failed to fetch from Gemini API. Status: ${res.status}. Body: ${errorData}`
          }
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    typeReceived = typeof rawText;

    if (rawText) {
      // Strip outer quotes and whitespace
      generatedText = rawText.replace(/^["']|["']$/g, "").trim();
      extractedTextLength = generatedText.length;
      extractedTextPreview = generatedText.slice(0, 100);
    }

    return new Response(
      JSON.stringify({
        text: generatedText,
        ok: true,
        debug: {
          hasGeminiKey,
          geminiStatus,
          extractedTextLength
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge Function Error:", error.message);
    return new Response(
      JSON.stringify({
        text: "",
        ok: false,
        debug: {
          typeReceived,
          hasGeminiKey,
          geminiStatus,
          extractedTextLength,
          extractedTextPreview,
          error: error.message
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
