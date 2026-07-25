import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USERNAME = "MikesHorcrux";
const API_ROOT = "https://api.github.com";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const statsDirectory = resolve(scriptDirectory, "../assets/stats");
const readmePath = resolve(scriptDirectory, "../README.md");

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USERNAME}-profile-stats`,
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function request(path) {
  const response = await fetch(`${API_ROOT}${path}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function fetchOwnedRepositories() {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/users/${USERNAME}/repos?type=owner&sort=updated&per_page=100&page=${page}`,
    );
    repositories.push(...batch);

    if (batch.length < 100) {
      return repositories;
    }
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildStatCard({ value, label, accent }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="176" viewBox="0 0 320 176" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(value)} ${escapeXml(label.toLowerCase())}</title>
  <desc id="desc">Current public GitHub data for ${USERNAME}.</desc>
  <defs>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="#35283A" opacity="0.052"/>
    </pattern>
  </defs>

  <rect width="320" height="176" rx="22" fill="#F5EEE6"/>
  <rect width="320" height="176" rx="22" fill="url(#dots)"/>
  <rect x="20" y="18" width="280" height="7" rx="3.5" fill="${accent}"/>
  <text x="24" y="102" font-family="Georgia, 'Times New Roman', serif"
    font-size="68" font-weight="700" fill="#35283A">${escapeXml(value)}</text>
  <text x="26" y="137" font-family="Arial, Calibri, ui-sans-serif, sans-serif"
    font-size="17" font-weight="700" letter-spacing="1.3" fill="#6F6173">${escapeXml(label)}</text>
  <rect x="1.5" y="1.5" width="317" height="173" rx="20.5" fill="none" stroke="#35283A" stroke-width="3" opacity="0.16"/>
</svg>
`;
}

async function updateReadme(stats) {
  const startMarker = "<!-- profile-stats:start -->";
  const endMarker = "<!-- profile-stats:end -->";
  const currentReadme = await readFile(readmePath, "utf8");
  const start = currentReadme.indexOf(startMarker);
  const end = currentReadme.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error("README profile-stat markers are missing or out of order.");
  }

  const summary = `${startMarker}
<p align="center"><strong>${stats.publicRepos} public repositories</strong> · <strong>${stats.starsEarned} stars on public work</strong> · <strong>${stats.followers} followers</strong> · <strong>${stats.swiftRepos} Swift repositories</strong></p>
${endMarker}`;
  const updatedReadme =
    currentReadme.slice(0, start) +
    summary +
    currentReadme.slice(end + endMarker.length);

  await writeFile(readmePath, updatedReadme, "utf8");
}

const [user, repositories] = await Promise.all([
  request(`/users/${USERNAME}`),
  fetchOwnedRepositories(),
]);

const originalRepositories = repositories.filter((repository) => !repository.fork);
const stats = {
  publicRepos: user.public_repos,
  followers: user.followers,
  starsEarned: originalRepositories.reduce(
    (total, repository) => total + repository.stargazers_count,
    0,
  ),
  swiftRepos: originalRepositories.filter(
    (repository) => repository.language === "Swift",
  ).length,
};

const cards = [
  {
    filename: "public-repositories.svg",
    value: stats.publicRepos,
    label: "PUBLIC REPOSITORIES",
    accent: "#9AA68D",
  },
  {
    filename: "stars-earned.svg",
    value: stats.starsEarned,
    label: "STARS ON PUBLIC WORK",
    accent: "#DFBD71",
  },
  {
    filename: "followers.svg",
    value: stats.followers,
    label: "FOLLOWERS",
    accent: "#C88775",
  },
  {
    filename: "swift-repositories.svg",
    value: stats.swiftRepos,
    label: "SWIFT REPOSITORIES",
    accent: "#9B89A4",
  },
];

await mkdir(statsDirectory, { recursive: true });
await Promise.all(
  cards.map((card) =>
    writeFile(
      resolve(statsDirectory, card.filename),
      buildStatCard(card),
      "utf8",
    ),
  ),
);
await updateReadme(stats);

console.log(`Updated ${cards.length} statistics cards and ${readmePath}`);
console.log(stats);
