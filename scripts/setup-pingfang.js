#!/usr/bin/env node
/**
 * setup-pingfang.js — PingFang 字体安装/转换脚本
 *
 * 从 OTF/TTF 源文件生成 WOFF2 并复制到 react-app/public/fonts/。
 *
 * 用法:
 *   node scripts/setup-pingfang.js <源目录>
 *
 * 示例:
 *   # 从下载的 OTF 目录安装
 *   node scripts/setup-pingfang.js ~/Downloads/PingFang-OTF-Fonts
 *
 *   # 从 macOS 系统字体提取（需要先运行 otc2otf）
 *   node scripts/setup-pingfang.js /System/Library/Fonts
 *
 * 前提条件:
 *   1. 安装 woff2 工具: brew install woff2
 *   2. 有 PingFang OTF/TTF 源文件
 *
 * 字体来源:
 *   - https://github.com/jimmyctk/PingFang-OTF-Fonts
 *   - macOS /System/Library/Fonts/PingFang.ttc（需 otc2otf 提取）
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const TARGET_DIR = path.resolve(__dirname, "..", "react-app", "public", "fonts");
const SOURCE_DIR = process.argv[2];

// 需要的字重映射
const WEIGHT_MAP = [
  { file: "PingFangSC-Regular", weight: 400, out: "pingfang-regular" },
  { file: "PingFangSC-Medium", weight: 500, out: "pingfang-medium" },
  { file: "PingFangSC-Semibold", weight: 600, out: "pingfang-semibold" },
];

function findSourceFile(dir, name) {
  for (const ext of [".otf", ".ttf", ".woff2"]) {
    const p = path.join(dir, name + ext);
    if (fs.existsSync(p)) return p;
  }
  // 也尝试小写和混合大小写
  for (const ext of [".otf", ".ttf", ".woff2"]) {
    const p = path.join(dir, name.toLowerCase() + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  if (!SOURCE_DIR) {
    console.log("🟡 用法: node scripts/setup-pingfang.js <源目录>");
    console.log("");
    console.log("   从 macOS 系统字体提取:");
    console.log("   1. cd /tmp && cp /System/Library/Fonts/PingFang.ttc .");
    console.log("   2. pip install afdko && otc2otf PingFang.ttc");
    console.log("   3. node scripts/setup-pingfang.js /tmp");
    console.log("");
    console.log("   或从 GitHub 下载 OTF:");
    console.log("   git clone https://github.com/jimmyctk/PingFang-OTF-Fonts.git");
    console.log("   node scripts/setup-pingfang.js ./PingFang-OTF-Fonts");
    console.log("");
    console.log("   如果字体文件已就绪，可直接将 WOFF2 放入:");
    console.log(`   ${TARGET_DIR}/`);
    process.exit(1);
  }

  // 检查 woff2 工具
  let hasWoff2 = false;
  try {
    execSync("which woff2_compress", { stdio: "ignore" });
    hasWoff2 = true;
    console.log("✅ woff2_compress 可用");
  } catch {
    console.warn("⚠️  woff2_compress 未安装。尝试使用 Node.js 库...");
  }

  // 确保目标目录存在
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  let converted = 0;
  let skipped = 0;

  for (const { file, weight, out } of WEIGHT_MAP) {
    const outputPath = path.join(TARGET_DIR, `${out}.woff2`);

    // 如果目标文件已存在，跳过
    if (fs.existsSync(outputPath)) {
      console.log(`⏭  ${out}.woff2 已存在`);
      skipped++;
      continue;
    }

    const sourcePath = findSourceFile(SOURCE_DIR, file);
    if (!sourcePath) {
      console.log(`⚠️  未找到 ${file}.otf/.ttf，跳过 ${out}.woff2`);
      continue;
    }

    console.log(`🔄 转换 ${path.basename(sourcePath)} → ${out}.woff2`);

    if (hasWoff2) {
      // 使用 woff2_compress 工具
      const tmpDir = path.dirname(outputPath);
      execSync(`woff2_compress "${sourcePath}"`, { stdio: "ignore", cwd: tmpDir });
      // woff2_compress 生成同名 .woff2 文件在源目录，需要移动
      const generatedName = path.basename(sourcePath).replace(/\.(otf|ttf)$/, ".woff2");
      const generatedPath = path.join(path.dirname(sourcePath), generatedName);
      if (fs.existsSync(generatedPath)) {
        fs.renameSync(generatedPath, outputPath);
      }
    } else {
      // 使用 Node.js 库（需要 npm install woff2）
      try {
        require.resolve("wawoff2");
        console.error("❌ wawoff2 库未安装。请运行: npm install wawoff2");
        process.exit(1);
      } catch {
        try {
          require.resolve("woff2");
          console.log("📦 使用 woff2 npm 包...");
          const woff2 = require("woff2");
          const input = fs.readFileSync(sourcePath);
          const output = woff2.encode(input);
          fs.writeFileSync(outputPath, output);
        } catch {
          console.error("❌ 未找到 woff2 或 wawoff2 npm 包");
          console.error("   请安装: npm install wawoff2");
          console.error("   或: brew install woff2");
          process.exit(1);
        }
      }
    }

    converted++;
    console.log(`✅ ${out}.woff2 (weight: ${weight})`);
  }

  console.log(`\n📊 统计: ${converted} 个转换, ${skipped} 个已存在`);

  if (converted > 0 || skipped < WEIGHT_MAP.length) {
    console.log("\n💡 若缺少字体文件，应用将自动回退到系统 PingFang + Inter。");
    console.log(`   字体文件位置: ${TARGET_DIR}/`);
  }
}

main().catch(console.error);
