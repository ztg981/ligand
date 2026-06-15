import { supabase } from "./supabaseClient.js";
import { reflectionPrompt } from "./ai.js"; // fallback

// Cache duration: 24 hours
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getCacheKey(goalId, action) {
  return `ligand.aiCache.${goalId}.${action}`;
}

export async function fetchAiInsight(goalId, action, context) {
  // 1. Check local cache
  const cacheKey = getCacheKey(goalId, action);
  try {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.result;
      }
    }
  } catch (err) {
    // ignore cache read errors
  }

  // 2. Fetch from Supabase Edge Function
  try {
    // Fast-fail if not logged in (guest mode) to avoid unnecessary network request
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) {
      throw new Error("Guest mode (not logged in)");
    }

    const { data, error } = await supabase.functions.invoke("gemini-insights", {
      body: { action, context },
    });

    if (error) {
      throw new Error(`Edge Function Error: ${error.message}`);
    }

    if (data?.result) {
      // 3. Update Cache
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ result: data.result, timestamp: Date.now() })
        );
      } catch (err) {
        // ignore cache write errors (e.g. quota exceeded)
      }
      return data.result;
    }

    throw new Error("No result in Edge Function response");
  } catch (error) {
    console.warn(`[AI] Failed to fetch ${action} insight. Using fallback.`, error);
    
    // 4. Graceful Fallbacks
    switch (action) {
      case "goal-summary":
        return "You're making steady progress. Keep showing up, even if it's just for five minutes.";
      case "overdue-advice":
        return "It's completely okay to push the date back if you need more time, or to archive it for later.";
      case "journal-prompt":
        return reflectionPrompt(); // Existing static fallback
      default:
        return "You're doing great.";
    }
  }
}
