import { describe, expect, it } from "bun:test";

import {
  parseYouTubeId,
  parseYouTubePlaylist,
  youtubeEmbedSrc,
  youtubeEmbedUrl,
  youtubePlaylistEmbedUrl,
} from "../src/components/content/youtube.ts";

const LIST = "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG";

describe("parseYouTubeId", () => {
  it("accepts a bare 11-character id", () => {
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("trims surrounding whitespace", () => {
    expect(parseYouTubeId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from every common URL form", () => {
    const cases = [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?list=RD&v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ];
    for (const url of cases) {
      expect(parseYouTubeId(url)).toBe("dQw4w9WgXcQ");
    }
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
  });

  it("returns null when nothing looks like an id", () => {
    expect(parseYouTubeId("https://example.com/not-a-video")).toBeNull();
    expect(parseYouTubeId("too-short")).toBeNull();
  });

  it("reads no video id from a playlist embed's videoseries path", () => {
    expect(
      parseYouTubeId(`https://www.youtube.com/embed/videoseries?list=${LIST}`)
    ).toBeNull();
  });
});

describe("parseYouTubePlaylist", () => {
  it("reads the list from a playlist embed or a playlist page", () => {
    const cases = [
      `https://www.youtube.com/embed/videoseries?list=${LIST}`,
      `https://www.youtube-nocookie.com/embed/videoseries?si=x&list=${LIST}`,
      `https://www.youtube.com/playlist?list=${LIST}`,
    ];
    for (const url of cases) {
      expect(parseYouTubePlaylist(url)).toBe(LIST);
    }
  });

  it("returns null for a video URL, even one in a playlist", () => {
    expect(
      parseYouTubePlaylist(
        `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${LIST}`
      )
    ).toBeNull();
    expect(parseYouTubePlaylist("dQw4w9WgXcQ")).toBeNull();
  });
});

describe("youtubeEmbedSrc", () => {
  it("embeds a video by id or URL", () => {
    expect(youtubeEmbedSrc("https://youtu.be/dQw4w9WgXcQ", { start: 5 })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5"
    );
  });

  it("embeds a playlist URL as the playlist", () => {
    expect(
      youtubeEmbedSrc(`https://www.youtube.com/playlist?list=${LIST}`)
    ).toBe(`https://www.youtube-nocookie.com/embed/videoseries?list=${LIST}`);
  });

  it("returns null when the input names neither", () => {
    expect(youtubeEmbedSrc("https://example.com/x")).toBeNull();
  });
});

describe("youtubePlaylistEmbedUrl", () => {
  it("adds a floored start time when positive", () => {
    expect(youtubePlaylistEmbedUrl(LIST, { start: 12.7 })).toBe(
      `https://www.youtube-nocookie.com/embed/videoseries?list=${LIST}&start=12`
    );
    expect(youtubePlaylistEmbedUrl(LIST, { start: 0 })).toBe(
      `https://www.youtube-nocookie.com/embed/videoseries?list=${LIST}`
    );
  });
});

describe("youtubeEmbedUrl", () => {
  it("builds a privacy-enhanced embed URL", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
  });

  it("appends a floored start time when positive", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", { start: 30.9 })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"
    );
  });

  it("omits the start param when zero or negative", () => {
    const base = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", { start: 0 })).toBe(base);
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", { start: -5 })).toBe(base);
  });
});
