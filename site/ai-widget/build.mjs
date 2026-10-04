// Injects the აგრო AI widget into site/index.html between ai:begin/ai:end markers.
// Rules text comes from supabase/functions/agro-chat/prompt.ts so the site demo and the
// edge function speak with one voice. Run: node site/ai-widget/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "index.html");
const prompt = readFileSync(join(here, "../../supabase/functions/agro-chat/prompt.ts"), "utf8");
const rules = prompt.match(/export const RULES = `([\s\S]*?)`;/)[1];

const css = readFileSync(join(here, "widget.css"), "utf8");
const html = readFileSync(join(here, "widget.html"), "utf8");
const js = readFileSync(join(here, "widget.js"), "utf8").replace("__AI_RULES__", () => JSON.stringify(rules));

let s = readFileSync(site, "utf8");
const put = (s, tag, anchor, body, open, close) => {
  const b = `${open} ai:begin ${tag} ${close}`, e = `${open} ai:end ${tag} ${close}`;
  const block = `${b}${body}${e}`;
  const i = s.indexOf(b);
  if (i >= 0) return s.slice(0, i) + block + s.slice(s.indexOf(e, i) + e.length);
  const at = s.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found for ${tag}: ${anchor}`);
  return s.slice(0, at) + block + "\n" + s.slice(at);
};
s = put(s, "css", "</style>\n\n<a class=\"skip\"", css, "/*", "*/");
s = put(s, "html", "<script>\nconst CONFIG", "\n" + html, "<!--", "-->");
s = put(s, "js", "/* ---------- init ---------- */", js, "/*", "*/");
if (!s.includes("aiEndpoint:")) {
  s = s.replace(
    '  orderWebhook: "",            // n8n webhook URL. ცარიელი = საჩვენებელი რეჟიმი\n',
    '  orderWebhook: "",            // n8n webhook URL. ცარიელი = საჩვენებელი რეჟიმი\n' +
    '  aiEndpoint: "",              // აგრო AI: Supabase edge function URL (…/functions/v1/agro-chat). ცარიელი = claude.ai-ში ჩაშენებული Claude ან ჩატი დამალულია\n',
  );
}
if (!s.includes("aiInit();")) s = s.replace("buildIdx();renderCount();syncBar();", "buildIdx();renderCount();syncBar();aiInit();");
if (!s.includes("aiEndpoint:") || !s.includes("aiInit();")) throw new Error("config/init hook not applied");
writeFileSync(site, s);
console.log("site/index.html updated");
