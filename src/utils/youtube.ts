const PATTERNS = [
  /youtu\.be\/([^?&/]+)/,
  /youtube\.com\/watch\?v=([^?&/]+)/,
  /youtube\.com\/shorts\/([^?&/]+)/,
  /youtube\.com\/embed\/([^?&/]+)/,
];

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  for (const pattern of PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
