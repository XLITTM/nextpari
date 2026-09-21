#!/usr/bin/env node
/**
 * Import exact Lucide 0.446.0 SVG geometry into Compose ImageVector factories.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const LUCIDE_TAG = "0.446.0";
const ANDROID_DIR = path.resolve(__dirname, "..");
const OUT_FILE = path.join(
  ANDROID_DIR,
  "app/src/main/java/com/nextpari/app/core/ui/icons/NextpariWebIcons.kt",
);

const ICONS = {
  plus: "Plus",
  moon: "Moon",
  sun: "Sun",
  settings: "Settings",
  search: "Search",
  "chevron-down": "ChevronDown",
  "chevron-right": "ChevronRight",
  "chevron-left": "ChevronLeft",
  "chevron-up": "ChevronUp",
  flame: "Flame",
  trophy: "Trophy",
  "gamepad-2": "Gamepad2",
  dices: "Dices",
  star: "Star",
  ticket: "Ticket",
  clock: "Clock",
  "layout-grid": "LayoutGrid",
  user: "User",
  mail: "Mail",
  wallet: "Wallet",
  sparkles: "Sparkles",
  headphones: "Headphones",
  "shield-check": "ShieldCheck",
  zap: "Zap",
  video: "Video",
  "check-circle": "CheckCircle",
  flag: "Flag",
  heart: "Heart",
  gift: "Gift",
  boxes: "Boxes",
  "key-round": "KeyRound",
  target: "Target",
  "trending-up": "TrendingUp",
  wrench: "Wrench",
  "scan-line": "ScanLine",
  bell: "Bell",
  info: "Info",
  "log-out": "LogOut",
  x: "X",
  pin: "Pin",
  radio: "Radio",
  play: "Play",
  lock: "Lock",
  eye: "Eye",
  "eye-off": "EyeOff",
  phone: "Phone",
  smartphone: "Smartphone",
  copy: "Copy",
  calendar: "Calendar",
  tag: "Tag",
  globe: "Globe",
  tv: "Tv",
  "arrow-left": "ArrowLeft",
  check: "Check",
  minus: "Minus",
  layers: "Layers",
  "alert-triangle": "AlertTriangle",
  "trash-2": "Trash2",
  "arrow-down-to-line": "ArrowDownToLine",
  "arrow-up-from-line": "ArrowUpFromLine",
  "clipboard-check": "ClipboardCheck",
  "mouse-pointer-click": "MousePointerClick",
  percent: "Percent",
  "share-2": "Share2",
  "check-circle-2": "CheckCircle2",
  "clock-3": "Clock3",
  "x-circle": "XCircle",
  bitcoin: "Bitcoin",
  banknote: "Banknote",
  "map-pin": "MapPin",
  "building-2": "Building2",
  scale: "Scale",
  "credit-card": "CreditCard",
  "book-open": "BookOpen",
  "shopping-cart": "ShoppingCart",
  "rotate-ccw": "RotateCcw",
  award: "Award",
  "circle-dollar-sign": "CircleDollarSign",
  coins: "Coins",
  crown: "Crown",
  gem: "Gem",
  save: "Save",
  "more-vertical": "MoreVertical",
  "sliders-horizontal": "SlidersHorizontal",
  "settings-2": "Settings2",
  "refresh-cw": "RefreshCw",
  expand: "Expand",
  filter: "Filter",
  wifi: "Wifi",
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Nextpari-Web-Icon-Importer/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${url} HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function fetchIconSource(name) {
  const base = `https://unpkg.com/lucide-react@${LUCIDE_TAG}/dist/esm/icons/`;
  let file = `${name}.js`;
  for (let i = 0; i < 4; i += 1) {
    const source = await fetchText(base + file);
    const reexport = source.match(/export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([^'"]+)['"]/);
    if (reexport) {
      file = reexport[1].endsWith(".js") ? reexport[1] : `${reexport[1]}.js`;
      continue;
    }
    return source;
  }
  throw new Error(`Too many re-exports for ${name}`);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function circleD(cx, cy, r) {
  return `M${cx + r},${cy}A${r},${r} 0 1 1 ${cx - r},${cy}A${r},${r} 0 1 1 ${cx + r},${cy}`;
}

function roundedRectD(x, y, w, h, rx, ry) {
  rx = Math.min(Math.abs(rx), w / 2);
  ry = Math.min(Math.abs(ry), h / 2);
  if (rx === 0 && ry === 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  return (
    `M${x + rx},${y}h${w - 2 * rx}` +
    `a${rx},${ry} 0 0 1 ${rx},${ry}v${h - 2 * ry}` +
    `a${rx},${ry} 0 0 1 ${-rx},${ry}h${-(w - 2 * rx)}` +
    `a${rx},${ry} 0 0 1 ${-rx},${-ry}v${-(h - 2 * ry)}` +
    `a${rx},${ry} 0 0 1 ${rx},${-ry}z`
  );
}

function parseSvg(svg) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
  });
  const doc = parser.parse(svg);
  const root = doc.svg;
  const paths = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    for (const [tag, raw] of Object.entries(node)) {
      if (tag === "path") {
        for (const el of asArray(raw)) if (el.d) paths.push(el.d);
      } else if (tag === "circle") {
        for (const el of asArray(raw)) {
          paths.push(circleD(Number(el.cx), Number(el.cy), Number(el.r)));
        }
      } else if (tag === "line") {
        for (const el of asArray(raw)) {
          paths.push(`M${el.x1},${el.y1}L${el.x2},${el.y2}`);
        }
      } else if (tag === "polyline") {
        for (const el of asArray(raw)) {
          const pts = String(el.points || "")
            .replace(/,/g, " ")
            .trim()
            .split(/\s+/);
          const coords = [];
          for (let i = 0; i < pts.length; i += 2) coords.push(`${pts[i]},${pts[i + 1]}`);
          if (coords.length) paths.push(`M${coords.join("L")}`);
        }
      } else if (tag === "polygon") {
        for (const el of asArray(raw)) {
          const pts = String(el.points || "")
            .replace(/,/g, " ")
            .trim()
            .split(/\s+/);
          const coords = [];
          for (let i = 0; i < pts.length; i += 2) coords.push(`${pts[i]},${pts[i + 1]}`);
          if (coords.length) paths.push(`M${coords.join("L")}Z`);
        }
      } else if (tag === "rect") {
        for (const el of asArray(raw)) {
          const x = Number(el.x || 0);
          const y = Number(el.y || 0);
          const w = Number(el.width);
          const h = Number(el.height);
          const rx = Number(el.rx || 0);
          const ry = Number(el.ry || el.rx || 0);
          paths.push(roundedRectD(x, y, w, h, rx, ry));
        }
      } else if (tag === "ellipse") {
        for (const el of asArray(raw)) {
          const cx = Number(el.cx);
          const cy = Number(el.cy);
          const rx = Number(el.rx);
          const ry = Number(el.ry);
          paths.push(
            `M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}`,
          );
        }
      } else if (typeof raw === "object") {
        for (const child of asArray(raw)) walk(child);
      }
    }
  }

  walk(root);
  if (!paths.length) throw new Error("No drawable geometry");
  return paths;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function kotlinGeometry(prop, lucideName, paths) {
  const items = paths.map((d) => `"${esc(d)}"`).join(",\n            ");
  return `    /** Lucide ${lucideName} @ ${LUCIDE_TAG}, ISC. */\n    val ${prop} = arrayOf(\n            ${items},\n    )\n`;
}

function kotlinFactory(prop) {
  const first = prop[0].toLowerCase() + prop.slice(1);
  return (
    `    fun ${first}(strokeWidth: Float = DefaultStroke): ImageVector =\n` +
    `        vector("${prop}", NextpariLucideGeometry.${prop}, strokeWidth)\n\n` +
    `    val ${prop}: ImageVector get() = ${first}()\n`
  );
}

async function main() {

  const entries = Object.entries(ICONS);
  const results = {};
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8);
    const loaded = await Promise.all(
      batch.map(async ([lucideName, prop]) => {
        process.stdout.write(`[fetch] ${prop}: ${lucideName}\n`);
        const source = await fetchIconSource(lucideName);
        try {
          const paths = parseLucideSource(source);
          return [prop, lucideName, paths];
        } catch (err) {
          err.message = `${prop}: ${err.message}`;
          throw err;
        }
      }),
    );
    for (const [prop, lucideName, paths] of loaded) {
      results[prop] = [lucideName, paths];
    }
  }

  const geometryBlocks = [];
  const factoryBlocks = [];
  for (const [lucideName, prop] of entries) {
    const [, paths] = results[prop];
    geometryBlocks.push(kotlinGeometry(prop, lucideName, paths));
    factoryBlocks.push(kotlinFactory(prop));
  }

  const output = `// AUTO-GENERATED by android/tools/import_nextpari_web_icons.mjs
// Source: Lucide Icons ${LUCIDE_TAG} (ISC) — same version as web lucide-react.
// Do not hand-edit path geometry. Rerun the importer if Lucide is upgraded.

package com.nextpari.app.core.ui.icons

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import java.util.concurrent.ConcurrentHashMap

internal object NextpariLucideGeometry {
${geometryBlocks.join("\n")}
}

object NextpariWebIcons {
    const val DefaultStroke = 2f
    const val HeaderPlusStroke = 2.5f
    const val HeaderStroke = 2.2f
    const val MainTabsStroke = 1.75f
    const val BottomNavActiveStroke = 2.4f
    const val BottomNavInactiveStroke = 2f
    const val CouponStroke = 2.4f
    const val MenuStroke = 1.5f

    val TabActive = Color(0xFFC88D3E)
    val TabInactiveLight = Color(0xFF9CA3AF)
    val TabInactiveDark = Color(0xFF6B7280)
    val MenuGreen = Color(0xFF4ADE80)
    val LiveRed = Color(0xFFEF4444)
    val HeaderLight = Color(0xFF1F2937)
    val HeaderDark = Color(0xFFE5E7EB)

    private val cache = ConcurrentHashMap<String, ImageVector>()

    fun vector(name: String, paths: Array<String>, strokeWidth: Float): ImageVector {
        val key = name + "@" + strokeWidth
        return cache.getOrPut(key) {
            val builder = ImageVector.Builder(
                name = "lucide." + name,
                defaultWidth = 24.dp,
                defaultHeight = 24.dp,
                viewportWidth = 24f,
                viewportHeight = 24f,
            )
            val parser = PathParser()
            paths.forEach { d ->
                builder.addPath(
                    pathData = parser.parsePathString(d).toNodes().toList(),
                    fill = SolidColor(Color.Transparent),
                    fillAlpha = 0f,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = strokeWidth,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                    strokeLineMiter = 4f,
                )
                parser.clear()
            }
            builder.build()
        }
    }

${factoryBlocks.join("\n")}
}

@Composable
fun NextpariWebIcon(
    imageVector: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
) {
    Icon(
        imageVector = imageVector,
        contentDescription = contentDescription,
        modifier = modifier,
        tint = tint,
    )
}
`;
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output, "utf8");
  console.log(`Generated: ${OUT_FILE}`);
  console.log(`Icons: ${Object.keys(results).length}`);
}

function parseLucideSource(source) {
  const iconMatch = source.match(/createLucideIcon\(\s*"[^"]+"\s*,\s*(\[[\s\S]*?\])\s*\)/);
  if (!iconMatch) throw new Error("createLucideIcon payload not found");
  const payload = iconMatch[1];
  const paths = [];
  const nodeRe = /\[\s*"(path|circle|line|rect|polyline|polygon|ellipse)"\s*,\s*\{([\s\S]*?)\}\s*\]/g;
  let m;
  while ((m = nodeRe.exec(payload))) {
    const tag = m[1];
    const attrs = Object.fromEntries(
      [...m[2].matchAll(/(\w+)\s*:\s*"([^"]*)"/g)].map((item) => [item[1], item[2]]),
    );
    if (tag === "path" && attrs.d) paths.push(attrs.d);
    else if (tag === "circle") paths.push(circleD(Number(attrs.cx), Number(attrs.cy), Number(attrs.r)));
    else if (tag === "line") paths.push(`M${attrs.x1},${attrs.y1}L${attrs.x2},${attrs.y2}`);
    else if (tag === "rect") {
      const x = Number(attrs.x || 0);
      const y = Number(attrs.y || 0);
      const w = Number(attrs.width);
      const h = Number(attrs.height);
      const rx = Number(attrs.rx || 0);
      const ry = Number(attrs.ry || attrs.rx || 0);
      paths.push(roundedRectD(x, y, w, h, rx, ry));
    } else if (tag === "polyline" || tag === "polygon") {
      const pts = String(attrs.points || "")
        .replace(/,/g, " ")
        .trim()
        .split(/\s+/);
      const coords = [];
      for (let i = 0; i < pts.length; i += 2) coords.push(`${pts[i]},${pts[i + 1]}`);
      paths.push(`M${coords.join("L")}${tag === "polygon" ? "Z" : ""}`);
    } else if (tag === "ellipse") {
      const cx = Number(attrs.cx);
      const cy = Number(attrs.cy);
      const rx = Number(attrs.rx);
      const ry = Number(attrs.ry);
      paths.push(
        `M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}`,
      );
    }
  }
  if (!paths.length) throw new Error("No drawable geometry in lucide source");
  return paths;
}

function parseSvgRegex(svg) {
  const paths = [];
  const pathRe = /<path\b[^>]*\bd="([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(svg))) paths.push(m[1]);
  const circleRe = /<circle\b[^>]*>/g;
  while ((m = circleRe.exec(svg))) {
    const tag = m[0];
    const cx = Number(/cx="([^"]+)"/.exec(tag)[1]);
    const cy = Number(/cy="([^"]+)"/.exec(tag)[1]);
    const r = Number(/r="([^"]+)"/.exec(tag)[1]);
    paths.push(circleD(cx, cy, r));
  }
  const lineRe = /<line\b[^>]*>/g;
  while ((m = lineRe.exec(svg))) {
    const tag = m[0];
    paths.push(
      `M${/x1="([^"]+)"/.exec(tag)[1]},${/y1="([^"]+)"/.exec(tag)[1]}L${/x2="([^"]+)"/.exec(tag)[1]},${/y2="([^"]+)"/.exec(tag)[1]}`,
    );
  }
  const rectRe = /<rect\b[^>]*>/g;
  while ((m = rectRe.exec(svg))) {
    const tag = m[0];
    const x = Number((/x="([^"]+)"/.exec(tag) || [0, 0])[1]);
    const y = Number((/y="([^"]+)"/.exec(tag) || [0, 0])[1]);
    const w = Number(/width="([^"]+)"/.exec(tag)[1]);
    const h = Number(/height="([^"]+)"/.exec(tag)[1]);
    const rx = Number((/rx="([^"]+)"/.exec(tag) || [0, 0])[1]);
    const ryMatch = /ry="([^"]+)"/.exec(tag);
    const ry = ryMatch ? Number(ryMatch[1]) : rx;
    paths.push(roundedRectD(x, y, w, h, rx, ry));
  }
  const polyRe = /<(polyline|polygon)\b[^>]*>/g;
  while ((m = polyRe.exec(svg))) {
    const tag = m[0];
    const pts = /points="([^"]+)"/.exec(tag)[1].replace(/,/g, " ").trim().split(/\s+/);
    const coords = [];
    for (let i = 0; i < pts.length; i += 2) coords.push(`${pts[i]},${pts[i + 1]}`);
    paths.push(`M${coords.join("L")}${m[1] === "polygon" ? "Z" : ""}`);
  }
  if (!paths.length) throw new Error("No drawable geometry");
  return paths;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
