import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "生命优化实验手册",
    short_name: "生命优化",
    description: "一个围绕生活变量记录、复盘与优化的个人实验手册。",
    start_url: "/",
    display: "standalone",
    background_color: "#e4edf7",
    theme_color: "#c8d5e2",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
