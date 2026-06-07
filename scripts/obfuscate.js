#!/usr/bin/env node
/**
 * obfuscate.js — 代码混淆脚本
 *
 * 在构建完成后执行，对所有 JS 产物进行混淆加密，
 * 提高逆向工程门槛。
 *
 * 用法:
 *   node scripts/obfuscate.js <file-or-dir> [<file-or-dir>...]
 *
 * 示例:
 *   node scripts/obfuscate.js react-app/dist/assets
 *   node scripts/obfuscate.js build/StockToolbox.app/Contents/Resources/server
 *   node scripts/obfuscate.js react-app/dist/assets
 */
const fs = require("fs");
const path = require("path");

// 加载 javascript-obfuscator
let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require("javascript-obfuscator");
} catch {
  try {
    JavaScriptObfuscator = require(path.resolve(__dirname, "..", "..", "node_modules", "javascript-obfuscator"));
  } catch {
    console.error("[obfuscate] javascript-obfuscator 未安装，请执行: npm install --save-dev javascript-obfuscator");
    process.exit(1);
  }
}

// 读取混淆配置
let obfuscatorOptions = {};
const configPath = path.resolve(__dirname, "obfuscate-config.json");
try {
  obfuscatorOptions = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch {
  console.warn("[obfuscate] 未找到 obfuscate-config.json，使用默认配置");
}

// 收集所有需要混淆的 .js / .cjs / .mjs 文件
function collectJSFiles(dirPath, results = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        collectJSFiles(fullPath, results);
      } else if (entry.isFile() && /\.(js|cjs|mjs)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* 跳过无法访问的目录 */ }
  return results;
}

// 解析参数：支持的参数可以是目录或文件
const args = process.argv.slice(2);
const targets = [];

for (const arg of args) {
  const resolved = path.resolve(arg);
  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      collectJSFiles(resolved, targets);
    } else if (stat.isFile()) {
      targets.push(resolved);
    }
  } catch {
    console.warn(`[obfuscate] ⚠ 路径不存在: ${arg}`);
  }
}

if (targets.length === 0) {
  console.warn("[obfuscate] 没有找到需要混淆的文件");
  process.exit(0);
}

// 去重
const uniqueTargets = [...new Set(targets)];
let totalFiles = 0;
let totalBytes = 0;

for (const filePath of uniqueTargets) {
  const originalContent = fs.readFileSync(filePath, "utf-8");

  // 跳过已混淆的文件（通过文件头标记）
  if (originalContent.startsWith("// obfuscated")) {
    console.log(`[obfuscate] ⏭ 已混淆，跳过: ${path.relative(process.cwd(), filePath)}`);
    continue;
  }

  // 跳过 node_modules
  if (filePath.includes("node_modules")) {
    continue;
  }

  const originalSize = Buffer.byteLength(originalContent, "utf-8");

  try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(originalContent, obfuscatorOptions);
    const obfuscatedContent = "// obfuscated\n" + obfuscationResult.getObfuscatedCode();
    const obfuscatedSize = Buffer.byteLength(obfuscatedContent, "utf-8");
    const ratio = ((obfuscatedSize / originalSize) * 100).toFixed(1);

    fs.writeFileSync(filePath, obfuscatedContent, "utf-8");
    totalFiles++;
    totalBytes += obfuscatedSize;

    console.log(`[obfuscate] ✅ ${path.relative(process.cwd(), filePath)}  (${originalSize} → ${obfuscatedSize} bytes, ${ratio}%)`);
  } catch (err) {
    console.error(`[obfuscate] ❌ 混淆失败: ${path.relative(process.cwd(), filePath)}: ${err.message}`);
  }
}

if (totalFiles > 0) {
  console.log(`\n[obfuscate] ✅ 完成: 混淆 ${totalFiles} 个文件，共 ${(totalBytes / 1024).toFixed(1)} KB`);
}
