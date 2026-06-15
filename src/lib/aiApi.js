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
      return "You're just getting started here — pick one tiny task today and let that count.";
    case "overdue-advice":
      return "It's completely okay to push the date back if you need more time, or to archive it for later.";
    case "journal-prompt":
      return reflectionPrompt(); // Existing static fallback
    default:
      return "You're doing great.";
  }
}

function debugLog(message, details) {
  if (import.meta.env.DEV) {
    console.log(`[AI Debug] ${message}`, details !== undefined ? details : "");
  }
}

function isValidInsight(text, action) {
  if (!text || typeof text !== "string") return false;
  
  const trimmed = text.replace(/^["']|["']$/g, "").trim();
  if (trimmed.length < 35) return false;
  
  const words = trimmed.split(/\s+/);
  if (words.length < 8) return false;

  const lower = trimmed.toLowerCase();
  const genericPhrases = [
    "it's okay", "it is okay", "its okay",
    "keep going", "keep it up",
    "you've got this", "you got this", "you've got this!", "you got this!",
    "you're doing great", "you are doing great",
    "every step counts", "you got it", "don't worry"
  ];
  
  for (const phrase of genericPhrases) {
    const cleanLower = lower.replace(/[.!?,]/g, "").trim();
    if (cleanLower === phrase) {
      return false;
    }
    if (lower.includes(phrase) && words.length < 12) {
      return false;
    }
  }

  // Check if it ends with a punctuation
  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?') {
    return false;
  }

  return true;
}

export function clearAiCache(goalId, action) {
  try {
    window.localStorage.removeItem(getCacheKey(goalId, action));
  } catch (err) {}
}

export async function fetchAiInsight(goalId, action, context, forceRefresh = false) {
  const cacheKey = getCacheKey(goalId, action);
  let cached = null;
  let hasValidCache = false;

  // 1. Check local cache
  try {
    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (cachedRaw) {
      cached = JSON.parse(cachedRaw);
      if (cached && cached.result) {
        if (isValidInsight(cached.result, action)) {
          hasValidCache = true;
        } else {
          // Delete bad/generic cache
          window.localStorage.removeItem(cacheKey);
          cached = null;
        }
      }
    }
  } catch (err) {
    // ignore cache read errors
  }

  // If normal page load and we have a valid cache that is not expired, use it
  if (!forceRefresh && hasValidCache) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL) {
      return { text: cached.result, source: "ai" };
    }
  }

  // 2. Fast-fail silently if Supabase is not configured (guest mode)
  if (!isSupabaseConfigured || !supabase) {
    debugLog("Supabase is not configured. Using logged-out fallback.");
    return { text: getFallback(action), source: "logged-out" };
  }

  // 3. Fetch from Supabase Edge Function
  let fallbackReason = "";
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionExists = !!sessionData?.session;
    debugLog("Supabase session exists:", sessionExists);

    if (!sessionExists) {
      fallbackReason = "No active session found (guest mode)";
      debugLog("Session does not exist. Using logged-out fallback.");
      return { text: getFallback(action), source: "logged-out" };
    }

    debugLog(`Calling supabase.functions.invoke("gemini-insights") for action: ${action}`);
    const { data, error } = await supabase.functions.invoke("gemini-insights", {
      body: { action, context },
    });

    debugLog("supabase.functions.invoke returned:", { data, error });

    if (error) {
      fallbackReason = `Edge Function Error: ${error.message}`;
      throw new Error(fallbackReason);
    }

    if (!data) {
      fallbackReason = "Empty response data from Edge Function";
      throw new Error(fallbackReason);
    }

    const textValue = data.text !== undefined ? data.text : data.result;
    debugLog("Exact data.text (or result):", textValue);

    if (!data.ok) {
      fallbackReason = `Edge Function response marked ok=false. Debug: ${JSON.stringify(data.debug)}`;
      throw new Error(fallbackReason);
    }

    if (textValue !== undefined && textValue !== null) {
      const cleanedText = textValue.replace(/^["']|["']$/g, "").trim();
      if (!isValidInsight(cleanedText, action)) {
        fallbackReason = `Text failed quality validation: "${cleanedText}"`;
        throw new Error(fallbackReason);
      }

      // 4. Update Cache (only with valid AI text)
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ result: cleanedText, timestamp: Date.now() })
        );
      } catch (err) {
        // ignore cache write errors
      }
      return { text: cleanedText, source: "ai" };
    }

    fallbackReason = "No result or text property found in response data";
    throw new Error(fallbackReason);

  } catch (err) {
    debugLog("Failed to fetch AI insight. Reason:", err.message);
    
    // If we have a valid cache, use it as 'last-ai' rather than showing fallback
    if (hasValidCache) {
      debugLog("Utilizing old valid cached AI insight on failure.");
      return { text: cached.result, source: "last-ai" };
    }

    debugLog("No valid cache exists. Returning fallback.");
    return { text: getFallback(action), source: "fallback" };
  }
}

