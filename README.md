# Zac Stern Portfolio

A clean, black-and-white portfolio site with subtle light-blue cyberpunk accents.

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, select **Deploy from a branch**.
3. Choose your main branch and `/ (root)`.
4. Save, then open your GitHub Pages URL.

## Customizing reels and UGC

- Edit `script.js` and add video entries in the `reels` or `ugcVideos` arrays.
- For each Google Drive video, use its file ID and set orientation:
  - `orientation: 'vertical'` for 9:16
  - `orientation: 'horizontal'` for 16:9
- UGC clips open in an expanded fullscreen-friendly playback dialog.
- Keep embed format:
  - Embed: `https://drive.google.com/file/d/FILE_ID/preview`
  - View link: `https://drive.google.com/file/d/FILE_ID/view`
