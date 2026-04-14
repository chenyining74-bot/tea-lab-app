import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #dbe8f4 0%, #c6d6e6 55%, #b6c8db 100%)",
          borderRadius: "24%",
          color: "#1f3347",
          fontSize: 56,
          fontWeight: 700,
        }}
      >
        实验
      </div>
    ),
    size,
  );
}
