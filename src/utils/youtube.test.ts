import { describe, it, expect } from "vitest";
import { parseVideo, exerciseVideo } from "./youtube";

describe("parseVideo", () => {
  it("handles bare IDs and the usual URL shapes", () => {
    expect(parseVideo("dQw4w9WgXcQ")?.embedUrl).toContain("embed/dQw4w9WgXcQ");
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")?.id).toBe("dQw4w9WgXcQ");
    expect(parseVideo("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });
  it("never embeds Shorts", () => {
    const a = parseVideo("https://youtube.com/shorts/abcdefghijk");
    expect(a).toMatchObject({ id: "abcdefghijk", isShort: true, embedUrl: null, watchUrl: "https://www.youtube.com/shorts/abcdefghijk" });
    expect(parseVideo("shorts:abcdefghijk")?.isShort).toBe(true);
  });
  it("rejects junk and falls back to a YouTube mediaUrl", () => {
    expect(parseVideo("")).toBeNull();
    expect(parseVideo("not a video")).toBeNull();
    expect(exerciseVideo({ videoId: "", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" })?.id).toBe("dQw4w9WgXcQ");
    expect(exerciseVideo({ videoId: "", mediaUrl: "https://x.com/a.png" })).toBeNull();
  });
});
