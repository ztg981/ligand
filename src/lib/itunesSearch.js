/* iTunes Search API - free, no key required. Used to look up a song by
   title while logging one in the Journal tab, so the user doesn't have to
   remember exact spelling. Best-effort only: any failure (network, bad
   response, empty results) resolves to an empty array rather than
   throwing, since this must never block manually typing a song in. */
const ENDPOINT = "https://itunes.apple.com/search";

export async function searchItunesSongs(query, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `${ENDPOINT}?term=${encodeURIComponent(q)}&entity=song&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    return data.results.map((r) => ({
      id: r.trackId,
      title: r.trackName || "",
      artist: r.artistName || "",
      album: r.collectionName || null,
      artworkUrl: r.artworkUrl60 || r.artworkUrl100 || null,
    }));
  } catch {
    return [];
  }
}
