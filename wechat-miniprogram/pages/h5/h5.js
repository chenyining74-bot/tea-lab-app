const config = require("../../config.js");

function normalizeBase(url) {
  const s = String(url || "").trim();
  if (!s) {
    return "";
  }
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

Page({
  data: {
    h5Url: "",
  },

  onLoad() {
    const base = normalizeBase(config.WEB_BASE_URL);
    if (!base) {
      return;
    }
    this.setData({
      h5Url: `${base}/`,
    });
  },
});
