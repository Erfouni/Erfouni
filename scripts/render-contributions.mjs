const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colors = {
  dark: {bg:'#0C1727',panel:'#111F32',ink:'#F0F6FC',secondary:'#B1BED0',muted:'#8596AE',line:'#24354C',mint:'#33E1C6',blue:'#80B9FF',purple:'#C0A4FF',amber:'#FFCB8A'},
  light: {bg:'#F5F8FC',panel:'#FFFFFF',ink:'#12243A',secondary:'#3D536D',muted:'#526780',line:'#D5E0EB',mint:'#087F72',blue:'#2463A8',purple:'#7650B0',amber:'#94600D'},
};
function svg(w,h,title,desc,body) {return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc>${body}</svg>\n`;}

function prLabel(prs) { const full = prs.map(x => `#${x}`).join(" + "); return full.length <= 24 ? full : `#${prs[0]} +${prs.length - 1} more`; }
export function renderContributions(projects, username) {
const files = {};
const projectCount = projects.length;
const prCount = projects.reduce((sum, project) => sum + project[4].length, 0);
const query = `https://github.com/search?q=author%3A${encodeURIComponent(username)}+is%3Apr+is%3Amerged+-user%3A${encodeURIComponent(username)}&type=pullrequests`;
for (const [theme,c] of Object.entries(colors)) {
  save(`impact-compact-${theme}.svg`,svg(758,96,`Open Source Impact: ${projectCount} projects, ${prCount} merged pull requests`,'Accepted contributions, linked to their merged pull requests.',`
    <style>@media(max-width:540px){.impact-title{font-size:36px}.impact-caption{font-size:21px}.impact-value{font-size:40px}.impact-label{font-size:22px}}</style>
    <defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="${c.panel}"/><stop offset="1" stop-color="${c.bg}"/></linearGradient></defs>
    <rect x=".5" y=".5" width="757" height="95" rx="10" fill="url(#surface)" stroke="${c.line}"/>
    <g font-family="Segoe UI,Arial,sans-serif">
      <rect x="20" y="25" width="3" height="20" rx="1.5" fill="${c.mint}"/>
      <text class="impact-title" x="32" y="43" fill="${c.ink}" font-size="24" font-weight="650" letter-spacing="-.6">Open Source Impact</text>
      <text class="impact-caption" x="20" y="69" fill="${c.secondary}" font-size="12">Accepted upstream. Linked to proof.</text>
      <path d="M444 23V73M592 23V73" stroke="${c.line}"/>
      <text class="impact-value" x="465" y="45" fill="${c.mint}" font-size="28" font-weight="650" letter-spacing="-.6">${projectCount}</text>
      <text class="impact-label" x="465" y="68" fill="${c.secondary}" font-size="12">projects</text>
      <text class="impact-value" x="613" y="45" fill="${c.mint}" font-size="28" font-weight="650" letter-spacing="-.6">${prCount}</text>
      <text class="impact-label" x="613" y="68" fill="${c.secondary}" font-size="12">merged PRs</text>
    </g>`));
  for (const [repo,name,category,lines,prs,accent] of projects) {
    const slug=repo.toLowerCase().replaceAll('/','--');
    const count=prs.length>1?`${prs.length} MERGED`:'MERGED';
    save(`${slug}-compact-${theme}.svg`,svg(400,142,`${name}: ${prs.length} merged pull requests`,`${repo}. ${lines.join(' ')} Merged: ${prs.map(x=>'#'+x).join(', ')}.`,`
      <defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="${c.panel}"/><stop offset="1" stop-color="${c.bg}"/></linearGradient></defs>
      <rect x=".8" y=".8" width="398.4" height="140.4" rx="16" fill="url(#surface)" stroke="${c.line}" stroke-width="1.6"/>
      <rect x="20" y="22" width="4" height="22" rx="2" fill="${c.mint}"/>
      <text x="34" y="42" fill="${c.ink}" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="650" letter-spacing="-.6">${esc(name)}</text>
      <g fill="${c.secondary}" font-family="Segoe UI,Arial,sans-serif" font-size="18"><text x="20" y="72">${esc(lines[0])}</text><text x="20" y="94">${esc(lines[1])}</text></g>
      <path d="M20 108H380" stroke="${c.line}"/>
      <circle cx="24" cy="126" r="3.5" fill="${c.mint}"/><text x="36" y="131" fill="${c.secondary}" font-family="Consolas,Menlo,monospace" font-size="15">${esc(prLabel(prs))}</text>
      <text x="380" y="131" text-anchor="end" fill="${c.mint}" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="600">${count} ↗</text>`));
  }
}
const picture=(slug,width,alt)=>`<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="./assets/contributions/${slug}-compact-dark.svg" />\n    <img src="./assets/contributions/${slug}-compact-light.svg" width="${width}" alt="${esc(alt)}" />\n  </picture>`;
let section = `<!-- open-source-impact:start -->\n\n## \`> contributions --merged\`\n\n<p align="center">\n<a href="${query}">\n  ${picture('impact',758,`Open Source Impact — ${projectCount} external projects, ${prCount} merged pull requests`)}\n</a>\n</p>\n\n<p align="center">\n`;
for(const [repo,name,cat,lines,prs] of projects){
  const href=prs.length===1?`https://github.com/${repo}/pull/${prs[0]}`:`https://github.com/${repo}/pulls?q=is%3Apr+is%3Amerged+author%3A${encodeURIComponent(username)}`;
  section+=`  <a href="${href}">\n    ${picture(repo.toLowerCase().replaceAll('/','--'),250,`${repo} — ${lines.join(' ')} Merged: ${prs.map(x=>'#'+x).join(', ')}.`)}\n  </a>\n`;
}
section+=`</p>\n\n<p align="center"><a href="${query}">Explore all merged contributions ↗</a></p>\n\n<!-- open-source-impact:end -->`;

function save(name, content) { files[`assets/contributions/${name}`] = content; }
return { files, section, projectCount, prCount };
}
