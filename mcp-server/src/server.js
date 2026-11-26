import { execFile } from "node:child_process";
import { randomUUID, webcrypto } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  ColorGradeSchema,
  TimelineAudioSchema,
  TimelineClipSchema,
  TimelineSchema,
  TimelineTextSchema,
  computeTotalDurationInFrames,
} from "./timelineSchema.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || "0.0.0.0";
const STUDIO_DIR = path.resolve(
  process.env.STUDIO_DIR || path.resolve(__dirname, "../../studio"),
);
const SRC_DIR = path.join(STUDIO_DIR, "src");
const PUBLIC_DIR = path.join(STUDIO_DIR, "public");
const OUT_DIR = path.join(STUDIO_DIR, "out");
const TIMELINE_PATH = path.join(SRC_DIR, "data", "timeline.json");
const ROOT_TSX_PATH = path.join(SRC_DIR, "Root.tsx");
const EXPORT_DIR = path.resolve(
  process.env.EXPORT_DIR || path.join(STUDIO_DIR, "exports"),
);
const IMPORT_ROOT_DIR = process.env.IMPORT_ROOT_DIR
  ? path.resolve(process.env.IMPORT_ROOT_DIR)
  : null;

function safeResolveInside(baseDir, relPath) {
  const resolved = path.resolve(baseDir, relPath);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes allowed directory: ${relPath}`);
  }
  return resolved;
}

function assertEditableStudioPath(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const allowedPrefixes = ["src/", "remotion.config.ts", "tsconfig.json", "package.json"];
  if (!allowedPrefixes.some((p) => normalized === p || normalized.startsWith(p))) {
    throw new Error(
      `Editing is restricted to studio/src/ and top-level config files (got: ${relPath})`,
    );
  }
  return safeResolveInside(STUDIO_DIR, normalized);
}

async function listFilesRecursive(dir, baseDir = dir, ignoreDirs = new Set(["node_modules", ".git", "out", "exports"])) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(full, baseDir, ignoreDirs)));
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      results.push({
        path: path.relative(baseDir, full).replace(/\\/g, "/"),
        sizeBytes: stat.size,
        ext: path.extname(entry.name).toLowerCase(),
      });
    }
  }
  return results;
}

async function readTimeline() {
  const raw = await fs.readFile(TIMELINE_PATH, "utf8");
  const parsed = TimelineSchema.parse(JSON.parse(raw));
  return {
    timeline: parsed,
    totalDurationInFrames: computeTotalDurationInFrames(parsed),
    totalDurationSeconds: Number(
      (computeTotalDurationInFrames(parsed) / parsed.fps).toFixed(3),
    ),
  };
}

async function writeTimeline(data) {
  const validated = TimelineSchema.parse(data);
  const tmpPath = `${TIMELINE_PATH}.tmp-${randomUUID()}`;
  await fs.writeFile(
    tmpPath,
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(tmpPath, TIMELINE_PATH);
  const totalFrames = computeTotalDurationInFrames(validated);
  return {
    timeline: validated,
    totalDurationInFrames: totalFrames,
    totalDurationSeconds: Number((totalFrames / validated.fps).toFixed(3)),
  };
}

function jsonText(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function resolveMediaSource(srcOrImportPath) {
  if (path.isAbsolute(srcOrImportPath)) {
    const insidePublic = path.relative(PUBLIC_DIR, srcOrImportPath);
    if (!insidePublic.startsWith("..") && !path.isAbsolute(insidePublic)) {
      return srcOrImportPath;
    }
    if (IMPORT_ROOT_DIR) {
      const insideImport = path.relative(IMPORT_ROOT_DIR, srcOrImportPath);
      if (!insideImport.startsWith("..") && !path.isAbsolute(insideImport)) {
        return srcOrImportPath;
      }
    }
    throw new Error(
      "Absolute media path must be inside studio/public or IMPORT_ROOT_DIR",
    );
  }
  return safeResolveInside(PUBLIC_DIR, srcOrImportPath);
}

function createMcpServer() {
  const server = new McpServer({
    name: "remotion-studio-mcp",
    version: "2.0.0",
  });

  server.tool(
    "list_project_files",
    "List source and config files in the Remotion studio project (src/, package.json, remotion.config.ts, tsconfig.json)",
    {
      subdir: z
        .string()
        .default("src")
        .describe("Relative directory inside studio/ to list (default 'src')"),
    },
    async ({ subdir }) => {
      const targetDir = safeResolveInside(STUDIO_DIR, subdir);
      const files = await listFilesRecursive(targetDir, STUDIO_DIR);
      return jsonText({ studioDir: STUDIO_DIR, count: files.length, files });
    },
  );

  server.tool(
    "read_project_file",
    "Read a source or config file inside the Remotion studio project (e.g. 'src/Root.tsx', 'package.json')",
    {
      filePath: z.string().describe("Path relative to studio/"),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
    },
    async ({ filePath, startLine, endLine }) => {
      const full = safeResolveInside(STUDIO_DIR, filePath);
      const raw = await fs.readFile(full, "utf8");
      const lines = raw.split(/\r?\n/);
      const start = startLine ? Math.max(1, startLine) : 1;
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;
      const slice = lines
        .slice(start - 1, end)
        .map((line, i) => `${start + i}: ${line}`)
        .join("\n");
      return jsonText({
        filePath,
        totalLines: lines.length,
        startLine: start,
        endLine: end,
        content: slice,
      });
    },
  );

  server.tool(
    "write_project_file",
    "Create or overwrite a file inside studio/src/ (or top-level Remotion config files) so Remotion Studio reloads live",
    {
      filePath: z
        .string()
        .describe("Path relative to studio/, e.g. 'src/videos/Intro/Intro.tsx'"),
      content: z.string(),
    },
    async ({ filePath, content }) => {
      const full = assertEditableStudioPath(filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const tmp = `${full}.tmp-${randomUUID()}`;
      await fs.writeFile(tmp, content, "utf8");
      await fs.rename(tmp, full);
      return jsonText({ ok: true, filePath, bytes: Buffer.byteLength(content, "utf8") });
    },
  );

  server.tool(
    "edit_project_file",
    "Replace an exact text block in a file inside studio/src/ (or Remotion config) without rewriting the whole file",
    {
      filePath: z.string().describe("Path relative to studio/"),
      target: z.string().describe("Exact text to find and replace"),
      replacement: z.string().describe("Replacement text"),
      replaceAll: z.boolean().default(false),
    },
    async ({ filePath, target, replacement, replaceAll }) => {
      const full = assertEditableStudioPath(filePath);
      const original = await fs.readFile(full, "utf8");
      if (!original.includes(target)) {
        throw new Error(`Target text not found in ${filePath}`);
      }
      const updated = replaceAll
        ? original.split(target).join(replacement)
        : original.replace(target, replacement);
      const tmp = `${full}.tmp-${randomUUID()}`;
      await fs.writeFile(tmp, updated, "utf8");
      await fs.rename(tmp, full);
      return jsonText({ ok: true, filePath });
    },
  );

  server.tool(
    "create_composition",
    "Scaffold a new React composition TSX file under studio/src/ and register its <Composition> inside src/Root.tsx",
    {
      compositionId: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
        .describe("Unique Remotion Composition ID, e.g. 'MeuVideoIntro'"),
      componentFile: z
        .string()
        .optional()
        .describe(
          "Optional path relative to studio/src/, defaults to '<compositionId>.tsx'",
        ),
      width: z.number().int().min(64).max(7680).default(1920),
      height: z.number().int().min(64).max(4320).default(1080),
      fps: z.number().int().min(1).max(120).default(60),
      durationInFrames: z.number().int().min(1).default(300),
      tsxCode: z
        .string()
        .optional()
        .describe(
          "Optional full TSX component code exporting `export const <compositionId>: React.FC`",
        ),
    },
    async ({
      compositionId,
      componentFile,
      width,
      height,
      fps,
      durationInFrames,
      tsxCode,
    }) => {
      const relFromSrc = (componentFile || `${compositionId}.tsx`)
        .replace(/\\/g, "/")
        .replace(/^src\//, "");
      const fullCompPath = safeResolveInside(SRC_DIR, relFromSrc);

      const defaultCode = `import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const ${compositionId}: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0D0E11",
        color: "#F4F1EA",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"Segoe UI Light", Inter, sans-serif',
        fontSize: 64,
        opacity,
      }}
    >
      ${compositionId}
    </AbsoluteFill>
  );
};
`;

      await fs.mkdir(path.dirname(fullCompPath), { recursive: true });
      await fs.writeFile(fullCompPath, tsxCode || defaultCode, "utf8");

      const importPath = `./${relFromSrc.replace(/\.(tsx|ts|jsx|js)$/, "")}`;
      let rootContent = await fs.readFile(ROOT_TSX_PATH, "utf8");

      const importStmt = `import { ${compositionId} } from "${importPath}";`;
      if (!rootContent.includes(importStmt)) {
        rootContent = `${importStmt}\n${rootContent}`;
      }

      const compJsx = `      <Composition
        id="${compositionId}"
        component={${compositionId}}
        durationInFrames={${durationInFrames}}
        fps={${fps}}
        width={${width}}
        height={${height}}
      />`;

      if (!rootContent.includes(`id="${compositionId}"`)) {
        const anchor = "    </>";
        if (!rootContent.includes(anchor)) {
          throw new Error("Could not find closing '</>' fragment in src/Root.tsx");
        }
        rootContent = rootContent.replace(anchor, `${compJsx}\n${anchor}`);
      }

      await fs.writeFile(ROOT_TSX_PATH, rootContent, "utf8");
      return jsonText({
        ok: true,
        compositionId,
        file: `src/${relFromSrc}`,
        width,
        height,
        fps,
        durationInFrames,
      });
    },
  );

  server.tool(
    "check_types",
    "Run TypeScript typechecking (`tsc --noEmit`) inside studio/ on the server SSD",
    {},
    async () => {
      try {
        const { stdout, stderr } = await execFileAsync(
          npxBin(),
          ["tsc", "--noEmit"],
          { cwd: STUDIO_DIR, maxBuffer: 5 * 1024 * 1024 },
        );
        return jsonText({ ok: true, output: (stdout || stderr || "No TypeScript errors").trim() });
      } catch (err) {
        return jsonText({
          ok: false,
          code: err.code ?? 1,
          stdout: err.stdout || "",
          stderr: err.stderr || err.message,
        });
      }
    },
  );

  server.tool(
    "list_assets",
    "List media assets inside studio/public/ ready for staticFile() in Remotion",
    {},
    async () => {
      await fs.mkdir(PUBLIC_DIR, { recursive: true });
      const files = await listFilesRecursive(PUBLIC_DIR, PUBLIC_DIR, new Set());
      return jsonText({
        publicDir: PUBLIC_DIR,
        count: files.length,
        files: files.map((f) => ({ src: f.path, sizeBytes: f.sizeBytes, ext: f.ext })),
      });
    },
  );

  server.tool(
    "import_media_from_drive",
    "Copy a video/audio/image file from IMPORT_ROOT_DIR into studio/public/ directly on the server",
    {
      driveRelativePath: z
        .string()
        .describe("Relative path inside IMPORT_ROOT_DIR (e.g. 'Videos/clip.mp4')"),
      targetName: z
        .string()
        .optional()
        .describe("Optional filename inside studio/public/"),
    },
    async ({ driveRelativePath, targetName }) => {
      if (!IMPORT_ROOT_DIR) {
        throw new Error("IMPORT_ROOT_DIR is not configured in server environment");
      }
      const source = safeResolveInside(IMPORT_ROOT_DIR, driveRelativePath);
      const destName = path.basename(targetName || source);
      const dest = safeResolveInside(PUBLIC_DIR, destName);
      await fs.mkdir(PUBLIC_DIR, { recursive: true });
      await fs.copyFile(source, dest);
      const stat = await fs.stat(dest);
      return jsonText({
        ok: true,
        source,
        publicSrc: destName,
        sizeBytes: stat.size,
      });
    },
  );

  server.tool(
    "inspect_media",
    "Probe a media file inside studio/public/ (or IMPORT_ROOT_DIR) using ffprobe to get duration, resolution, fps, and audio streams",
    {
      src: z
        .string()
        .describe("Relative path inside studio/public/, or absolute path inside IMPORT_ROOT_DIR"),
    },
    async ({ src }) => {
      const target = resolveMediaSource(src);
      const { stdout } = await execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          target,
        ],
        { maxBuffer: 5 * 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout);
      const videoStream = parsed.streams?.find((s) => s.codec_type === "video");
      const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
      return jsonText({
        src,
        durationSec: parsed.format?.duration
          ? Number(parsed.format.duration)
          : null,
        sizeBytes: parsed.format?.size ? Number(parsed.format.size) : null,
        video: videoStream
          ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              rFrameRate: videoStream.r_frame_rate,
              avgFrameRate: videoStream.avg_frame_rate,
            }
          : null,
        audio: audioStream
          ? {
              codec: audioStream.codec_name,
              sampleRate: audioStream.sample_rate,
              channels: audioStream.channels,
            }
          : null,
      });
    },
  );

  server.tool(
    "extract_frames",
    "Extract a 1-fps (or custom interval) contact sheet JPEG from a video asset using ffmpeg on the server SSD so the agent can inspect scenes visually",
    {
      src: z.string().describe("Relative path inside studio/public/ or IMPORT_ROOT_DIR"),
      intervalSec: z.number().min(0.2).max(30).default(1),
      columns: z.number().int().min(1).max(10).default(5),
      rows: z.number().int().min(1).max(12).default(6),
    },
    async ({ src, intervalSec, columns, rows }) => {
      const target = resolveMediaSource(src);
      const tmpJpg = path.join(os.tmpdir(), `remotion-sheet-${randomUUID()}.jpg`);
      try {
        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-i",
            target,
            "-vf",
            `fps=1/${intervalSec},scale=384:216:force_original_aspect_ratio=decrease,tile=${columns}x${rows}`,
            "-frames:v",
            "1",
            tmpJpg,
          ],
          { maxBuffer: 10 * 1024 * 1024 },
        );
        const buf = await fs.readFile(tmpJpg);
        return {
          content: [
            {
              type: "text",
              text: `Contact sheet for ${src} (1 frame every ${intervalSec}s, grid ${columns}x${rows})`,
            },
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: "image/jpeg",
            },
          ],
        };
      } finally {
        await fs.unlink(tmpJpg).catch(() => {});
      }
    },
  );

  server.tool(
    "get_timeline",
    "Read the current structured timeline state (studio/src/data/timeline.json) powering the TimelineEditor composition",
    {},
    async () => jsonText(await readTimeline()),
  );

  server.tool(
    "set_timeline",
    "Replace the full timeline JSON (clips, texts, audioTracks, colorGrade, fps, width, height) for TimelineEditor",
    {
      timeline: TimelineSchema,
    },
    async ({ timeline }) => jsonText(await writeTimeline(timeline)),
  );

  server.tool(
    "upsert_clip",
    "Add or update a video clip in the TimelineEditor sequence by id",
    {
      clip: TimelineClipSchema,
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Optional insertion index when adding a new clip"),
    },
    async ({ clip, index }) => {
      const { timeline } = await readTimeline();
      const existingIdx = timeline.clips.findIndex((c) => c.id === clip.id);
      if (existingIdx >= 0) {
        timeline.clips[existingIdx] = clip;
      } else if (typeof index === "number" && index <= timeline.clips.length) {
        timeline.clips.splice(index, 0, clip);
      } else {
        timeline.clips.push(clip);
      }
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "remove_clip",
    "Remove a video clip from TimelineEditor by id",
    { id: z.string().min(1) },
    async ({ id }) => {
      const { timeline } = await readTimeline();
      timeline.clips = timeline.clips.filter((c) => c.id !== id);
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "upsert_text",
    "Add or update a minimalist animated text overlay in TimelineEditor by id",
    {
      textOverlay: TimelineTextSchema,
    },
    async ({ textOverlay }) => {
      const { timeline } = await readTimeline();
      const idx = timeline.texts.findIndex((t) => t.id === textOverlay.id);
      if (idx >= 0) {
        timeline.texts[idx] = textOverlay;
      } else {
        timeline.texts.push(textOverlay);
      }
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "remove_text",
    "Remove a text overlay from TimelineEditor by id",
    { id: z.string().min(1) },
    async ({ id }) => {
      const { timeline } = await readTimeline();
      timeline.texts = timeline.texts.filter((t) => t.id !== id);
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "upsert_audio_track",
    "Add or update a background music or audio track in TimelineEditor by id",
    {
      audioTrack: TimelineAudioSchema,
    },
    async ({ audioTrack }) => {
      const { timeline } = await readTimeline();
      const idx = timeline.audioTracks.findIndex(
        (a) => a.id === audioTrack.id,
      );
      if (idx >= 0) {
        timeline.audioTracks[idx] = audioTrack;
      } else {
        timeline.audioTracks.push(audioTrack);
      }
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "set_color_grade",
    "Update global color correction and vignette settings in TimelineEditor",
    {
      colorGrade: ColorGradeSchema,
    },
    async ({ colorGrade }) => {
      const { timeline } = await readTimeline();
      timeline.colorGrade = colorGrade;
      return jsonText(await writeTimeline(timeline));
    },
  );

  server.tool(
    "list_compositions",
    "List all Remotion compositions registered in src/Root.tsx",
    {},
    async () => {
      const { stdout } = await execFileAsync(
        npxBin(),
        ["remotion", "compositions", "src/index.ts", "--quiet"],
        { cwd: STUDIO_DIR, maxBuffer: 5 * 1024 * 1024 },
      );
      return jsonText({ studioDir: STUDIO_DIR, output: stdout.trim() });
    },
  );

  server.tool(
    "capture_frame",
    "Render a single Remotion frame for ANY composition using `remotion still` on the server SSD and return it as an image",
    {
      compositionId: z.string().default("TimelineEditor"),
      frame: z.number().int().min(0).default(0),
    },
    async ({ compositionId, frame }) => {
      const tmpPng = path.join(
        os.tmpdir(),
        `remotion-still-${compositionId}-${frame}-${randomUUID()}.png`,
      );
      try {
        await execFileAsync(
          npxBin(),
          [
            "remotion",
            "still",
            "src/index.ts",
            compositionId,
            tmpPng,
            `--frame=${frame}`,
          ],
          { cwd: STUDIO_DIR, maxBuffer: 10 * 1024 * 1024 },
        );
        const buf = await fs.readFile(tmpPng);
        return {
          content: [
            {
              type: "text",
              text: `Captured ${compositionId} at frame ${frame}`,
            },
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } finally {
        await fs.unlink(tmpPng).catch(() => {});
      }
    },
  );

  server.tool(
    "render_video",
    "Render ANY Remotion composition on the server SSD into studio/out/ or EXPORT_DIR",
    {
      compositionId: z.string().default("TimelineEditor"),
      filename: z
        .string()
        .default("output.mp4")
        .describe("Output filename, e.g. 'my-video.mp4'"),
      saveToDrive: z
        .boolean()
        .default(false)
        .describe("If true, saves into EXPORT_DIR instead of studio/out/"),
      codec: z
        .enum(["h264", "h265", "vp8", "vp9", "prores", "gif"])
        .optional(),
      crf: z.number().int().min(10).max(35).optional(),
      frames: z
        .string()
        .regex(/^\d+(-\d+)?$/)
        .optional()
        .describe("Optional frame or range, e.g. '0-180'"),
    },
    async ({ compositionId, filename, saveToDrive, codec, crf, frames }) => {
      const safeName = path.basename(filename);
      const targetDir = saveToDrive ? EXPORT_DIR : OUT_DIR;
      await fs.mkdir(targetDir, { recursive: true });
      const outPath = path.join(targetDir, safeName);
      const args = ["remotion", "render", "src/index.ts", compositionId, outPath];
      if (codec) {
        args.push(`--codec=${codec}`);
      }
      if (typeof crf === "number") {
        args.push(`--crf=${crf}`);
      }
      if (frames) {
        args.push(`--frames=${frames}`);
      }
      const startedAt = Date.now();
      const { stdout } = await execFileAsync(npxBin(), args, {
        cwd: STUDIO_DIR,
        maxBuffer: 15 * 1024 * 1024,
      });
      const stat = await fs.stat(outPath);
      return jsonText({
        compositionId,
        outPath,
        sizeBytes: stat.size,
        elapsedMs: Date.now() - startedAt,
        tail: stdout.split("\n").slice(-8).join("\n"),
      });
    },
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, Accept",
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        server: "remotion-studio-mcp",
        version: "2.0.0",
        studioDir: STUDIO_DIR,
        timelinePath: TIMELINE_PATH,
        uptimeSec: Math.round(process.uptime()),
      }),
    );
    return;
  }

  if (pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found. Use /mcp or /health." }));
    return;
  }

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    mcpServer.close().catch(() => {});
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `remotion-studio-mcp v2.0.0 listening on http://${HOST}:${PORT}/mcp (STUDIO_DIR=${STUDIO_DIR})`,
  );
});
