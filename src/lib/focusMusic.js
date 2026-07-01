/* Curated focus-music suggestions - discovery links only, never playback.
   Each entry opens a Spotify or YouTube *search* for the genre/mood rather
   than a specific playlist ID, since specific editorial playlist IDs drift
   or get retired over time while a search always returns something current.
   No lyrics, no distractions is the through-line - picked for deep work,
   reading, and studying, not for casual listening. */

export function spotifySearch(query) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}
export function youtubeSearch(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export const FOCUS_MUSIC = [
  {
    genre: "Lo-fi hip hop",
    goodFor: "Deep work, reading, light coding",
    query: "lofi hip hop beats to study to",
  },
  {
    genre: "Lo-fi chillhop",
    goodFor: "Long writing sessions",
    query: "chillhop instrumental study beats",
  },
  {
    genre: "Ambient",
    goodFor: "Deep focus, blocking out noise",
    query: "ambient focus music instrumental",
  },
  {
    genre: "Instrumental electronic",
    goodFor: "Repetitive or administrative tasks",
    query: "instrumental electronic focus music",
  },
  {
    genre: "Classical for studying",
    goodFor: "Reading, studying, memorization",
    query: "classical music for studying focus",
  },
  {
    genre: "Solo piano",
    goodFor: "Reading, journaling, winding down into focus",
    query: "peaceful solo piano focus",
  },
  {
    genre: "Baroque (Bach, Vivaldi)",
    goodFor: "Steady-tempo work, data entry",
    query: "baroque music for concentration",
  },
  {
    genre: "Jazz for focus",
    goodFor: "Creative work, design, brainstorming",
    query: "jazz for focus instrumental",
  },
  {
    genre: "Bossa nova / lounge jazz",
    goodFor: "Relaxed afternoon work",
    query: "bossa nova instrumental focus",
  },
  {
    genre: "Rain sounds",
    goodFor: "Blocking distraction, calming anxiety",
    query: "rain sounds for focus",
  },
  {
    genre: "Ocean / waves",
    goodFor: "Slow, sustained deep work",
    query: "ocean waves ambient focus",
  },
  {
    genre: "Forest / nature ambience",
    goodFor: "Reducing overstimulation",
    query: "forest nature sounds ambient focus",
  },
  {
    genre: "White / brown noise",
    goodFor: "Blocking out a noisy environment entirely",
    query: "brown noise for focus",
  },
  {
    genre: "Minecraft OST (C418)",
    goodFor: "Coding, calm sustained focus",
    query: "minecraft calm music focus",
  },
  {
    genre: "Stardew Valley OST",
    goodFor: "Cozy, low-key admin work",
    query: "stardew valley soundtrack focus",
  },
  {
    genre: "Studio Ghibli OSTs",
    goodFor: "Gentle background for reading or writing",
    query: "studio ghibli soundtrack focus instrumental",
  },
  {
    genre: "Video game OSTs (general)",
    goodFor: "Long focus blocks without lyrics",
    query: "video game soundtracks for studying",
  },
  {
    genre: "Post-rock instrumental",
    goodFor: "Big-push deep work, building momentum",
    query: "post rock instrumental focus explosions in the sky",
  },
  {
    genre: "Cinematic / soundtrack instrumental",
    goodFor: "High-focus, high-stakes work",
    query: "cinematic instrumental focus music",
  },
  {
    genre: "Binaural beats",
    goodFor: "Sustained concentration, entering flow",
    query: "binaural beats focus concentration",
  },
  {
    genre: "Focus frequencies (40Hz / gamma)",
    goodFor: "Studying, deep concentration",
    query: "40hz focus frequency gamma waves",
  },
  {
    genre: "Isochronic tones",
    goodFor: "Sustained attention during long sessions",
    query: "isochronic tones focus",
  },
  {
    genre: "Synthwave instrumental",
    goodFor: "Energized late-night work",
    query: "instrumental synthwave focus",
  },
  {
    genre: "Downtempo / trip hop",
    goodFor: "Slow-burn creative work",
    query: "downtempo instrumental focus",
  },
];
