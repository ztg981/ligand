import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { reflectionPrompt } from "./ai.js"; // fallback

// Cache duration: 24 hours
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getCacheKey(goalId, action) {
  return `ligand.aiCache.${goalId}.${action}`;
}

function getFallback(action) {
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

function isValidInsight(text) {
  if (!text || typeof text !== "string") return false;
  if (text.length < 20) return false;
  if (text.trim().split(/\s+/).length < 5) return false;
  return true;
}

export function clearAiCache(goalId, action) {
  try {
    window.localStorage.removeItem(getCacheKey(goalId, action));
  } catch (err) {}
}

export async function fetchAiInsight(goalId, action, context) {
  // 1. Check local cache
  const cacheKey = getCacheKey(goalId, action);
  try {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        if (isValidInsight(cached.result)) {
          return { text: cached.result, source: "ai" };
        } else {
          // Clear bad cache
          window.localStorage.removeItem(cacheKey);
        }
      }
    }
  } catch (err) {
    // ignore cache read errors
  }

  // 2. Fast-fail silently if Supabase is not configured
  if (!isSupabaseConfigured || !supabase) {
    return { text: getFallback(action), source: "logged-out" };
  }

  // 3. Fetch from Supabase Edge Function
  try {
    // Fast-fail silently if not logged in (guest mode)
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) {
      return { text: getFallback(action), source: "logged-out" };
    }

    const { data, error } = await supabase.functions.invoke("gemini-insights", {
      body: { action, context },
    });

    if (error) {
      throw new Error(`Edge Function Error: ${error.message}`);
    }

    if (data?.result) {
      if (!isValidInsight(data.result)) {
        throw new Error("AI returned truncated or invalid text");
      }
      // 4. Update Cache
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ result: data.result, timestamp: Date.now() })
        );
      } catch (err) {
        // ignore cache write errors
      }
      return { text: data.result, source: "ai" };
    }

    throw new Error("No result in Edge Function response");
  } catch (error) {
    console.warn(`[AI] Failed to fetch ${action} insight. Using fallback.`, error);
    return { text: getFallback(action), source: "fallback" };
  }
}

