/* eslint-disable react-refresh/only-export-components -- this is a utility
   module (detection helpers + an icon registry), not a component module. */
import { Mail, Phone, Globe, MapPin, Link as LinkIco } from "lucide-react";
import {
  Github,
  Linkedin,
  X,
  Gitlab,
  StackOverflow,
  Instagram,
  Youtube,
  Facebook,
  Dribbble,
  Mastodon,
  Bluesky,
  Telegram,
  Whatsapp,
} from "../components/BrandIcons";

// iconKey -> component. Used both for auto-detected icons and the override picker.
export const LINK_ICONS = {
  mail: Mail,
  phone: Phone,
  globe: Globe,
  map: MapPin,
  link: LinkIco,
  github: Github,
  linkedin: Linkedin,
  x: X,
  gitlab: Gitlab,
  stackoverflow: StackOverflow,
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  dribbble: Dribbble,
  mastodon: Mastodon,
  bluesky: Bluesky,
  telegram: Telegram,
  whatsapp: Whatsapp,
};

// Order shown in the icon-override picker.
export const ICON_PICKER_KEYS = [
  "globe", "link", "mail", "phone", "map",
  "github", "gitlab", "linkedin", "x", "stackoverflow",
  "instagram", "youtube", "facebook", "dribbble",
  "mastodon", "bluesky", "telegram", "whatsapp",
];

// Hostname substring -> { icon, label }. First match wins.
const HOST_RULES = [
  [["github.com"], "github", "GitHub"],
  [["gitlab.com"], "gitlab", "GitLab"],
  [["linkedin.com", "lnkd.in"], "linkedin", "LinkedIn"],
  [["twitter.com", "x.com"], "x", "X"],
  [["stackoverflow.com", "stackexchange.com"], "stackoverflow", "Stack Overflow"],
  [["instagram.com"], "instagram", "Instagram"],
  [["youtube.com", "youtu.be"], "youtube", "YouTube"],
  [["facebook.com", "fb.com"], "facebook", "Facebook"],
  [["dribbble.com"], "dribbble", "Dribbble"],
  [["bsky.app"], "bluesky", "Bluesky"],
  [["mastodon", "fosstodon", "hachyderm"], "mastodon", "Mastodon"],
  [["t.me", "telegram"], "telegram", "Telegram"],
  [["wa.me", "whatsapp.com"], "whatsapp", "WhatsApp"],
  [["maps.google", "google.com/maps", "goo.gl/maps", "maps.app"], "map", "Location"],
];

// Detect the icon + display label for a URL. Returns { icon, label }.
export function detectLink(rawUrl) {
  const url = (rawUrl || "").trim();
  if (!url) return { icon: "globe", label: "" };

  if (/^mailto:/i.test(url)) return { icon: "mail", label: url.replace(/^mailto:/i, "") };
  if (/^tel:/i.test(url)) return { icon: "phone", label: url.replace(/^tel:/i, "") };

  const lower = url.toLowerCase();
  for (const [hosts, icon, label] of HOST_RULES) {
    if (hosts.some((h) => lower.includes(h))) return { icon, label };
  }

  // Fallback: Globe + the domain name (without protocol / www / trailing path).
  let host = url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "");
  host = host.split(/[/?#]/)[0] || host;
  return { icon: "globe", label: host || "Link" };
}

// Resolve a stored link to what we actually render, honouring manual overrides.
export function resolveLink(link) {
  const detected = detectLink(link?.url);
  return {
    iconKey: link?.icon || detected.icon,
    label: link?.label || detected.label,
    detectedIcon: detected.icon,
    detectedLabel: detected.label,
  };
}

// Render a link icon by key (falls back to Globe for unknown keys).
export function LinkIcon({ iconKey, className = "" }) {
  const Cmp = LINK_ICONS[iconKey] || Globe;
  return <Cmp className={className} />;
}
