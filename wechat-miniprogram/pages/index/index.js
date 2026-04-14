Page({
  data: {
    activeTab: "input",
    /** 与 src/app/page.tsx 里 builtinModules 顺序、名称一致（便于你对照网页） */
    modules: [
      { id: "health", icon: "🧠", title: "实验总览" },
      { id: "archive", icon: "🗂️", title: "文件夹归纳" },
      { id: "quick-input", icon: "✏️", title: "快速输入" },
      { id: "safety", icon: "🛟", title: "安全守则" },
      { id: "gaming", icon: "🎮", title: "游戏进度" },
      { id: "period", icon: "🌙", title: "周期监测" },
      { id: "planner", icon: "🗓️", title: "计划系统" },
      { id: "shopping", icon: "🛒", title: "购物清单" },
      { id: "memory", icon: "🗂️", title: "记忆档案馆" },
      { id: "reflection", icon: "📖", title: "读后感" },
      { id: "essay", icon: "✍️", title: "生命感悟" },
      { id: "store", icon: "🛍️", title: "模块工坊" },
    ],
  },

  onLoad() {},

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    wx.showToast({ title: "该页与网页版对齐开发中", icon: "none", duration: 2000 });
  },

  onSummaryTap() {
    wx.showToast({ title: "今日摘要开发中", icon: "none" });
  },

  onModuleTap(e) {
    const title = e.currentTarget.dataset.title || "模块";
    wx.showToast({ title: `${title} · 开发中`, icon: "none" });
  },
});
