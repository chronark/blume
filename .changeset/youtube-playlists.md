---
"blume": patch
---

`<YouTube>` embeds a playlist URL as the playlist. A `url` like `https://www.youtube.com/embed/videoseries?list=…` used to embed a video with the id `videoseries`, which doesn't exist, and `https://www.youtube.com/playlist?list=…` rendered nothing. Both now embed the playlist, the page's Markdown copy links to it, and a playlist pasted into a Notion video block becomes the embed too.
