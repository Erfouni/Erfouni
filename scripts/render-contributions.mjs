const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colors = {
  dark: {bg:'#091321',panel:'#0D1B2D',ink:'#F0F6FC',secondary:'#B1BED0',muted:'#8596AE',line:'#24354C',mint:'#33E1C6',blue:'#80B9FF',purple:'#C0A4FF',amber:'#FFCB8A'},
  light: {bg:'#F6F9FC',panel:'#FFFFFF',ink:'#12243A',secondary:'#3D536D',muted:'#526780',line:'#D5E0EB',mint:'#087F72',blue:'#2463A8',purple:'#7650B0',amber:'#94600D'},
};
function svg(w,h,title,desc,body) {return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc>${body}</svg>\n`;}

function prLabel(prs) { const full = prs.map(x => `#${x}`).join(" + "); return full.length <= 24 ? full : `#${prs[0]} +${prs.length - 1} more`; }
export function renderContributions(projects, username) {
const files = {};
const projectCount = projects.length;
const prCount = projects.reduce((sum, project) => sum + project[4].length, 0);
const query = `https://github.com/search?q=author%3A${encodeURIComponent(username)}+is%3Apr+is%3Amerged+-user%3A${encodeURIComponent(username)}&type=pullrequests`;
for (const [theme,c] of Object.entries(colors)) {
  save(`impact-compact-${theme}.svg`,svg(840,140,`Open Source Impact: ${projectCount} projects, ${prCount} merged pull requests`,'Accepted contributions, linked to their merged pull requests.',`
    <defs><linearGradient id="bg"><stop stop-color="${c.panel}"/><stop offset="1" stop-color="${c.bg}"/></linearGradient></defs>
    <rect x="1" y="1" width="838" height="138" rx="14" fill="url(#bg)" stroke="${c.line}"/>
    <g font-family="Segoe UI,Arial,sans-serif"><text x="26" y="61" fill="${c.ink}" font-size="36" font-weight="700" letter-spacing="-.8">Open Source Impact</text><text x="27" y="97" fill="${c.secondary}" font-size="19">Accepted upstream. Linked to proof.</text>
    <path d="M470 30V110M650 30V110" stroke="${c.line}"/>
    <text x="501" y="72" fill="${c.mint}" font-size="48" font-weight="700">${projectCount}</text><text x="502" y="100" fill="${c.secondary}" font-size="16">projects</text>
    <text x="682" y="72" fill="${c.ink}" font-size="48" font-weight="700">${prCount}</text><text x="682" y="100" fill="${c.secondary}" font-size="16">merged PRs</text></g>`));
  for (const [repo,name,category,lines,prs,accent] of projects) {
    const a=c[accent], slug=repo.toLowerCase().replaceAll('/','--');
    const count=prs.length>1?`${prs.length} MERGED`:'MERGED';
    save(`${slug}-compact-${theme}.svg`,svg(400,142,`${name}: ${prs.length} merged pull requests`,`${repo}. ${lines.join(' ')} Merged: ${prs.map(x=>'#'+x).join(', ')}.`,`
      <rect x="1" y="1" width="398" height="140" rx="12" fill="${c.panel}" stroke="${accent==='mint'?a:c.line}" stroke-opacity="${accent==='mint'?'.65':'1'}"/>
      <rect x="16" y="20" width="3" height="21" rx="1.5" fill="${a}"/>
      <text x="28" y="37" fill="${c.ink}" font-family="Segoe UI,Arial,sans-serif" font-size="25" font-weight="650" letter-spacing="-.6">${esc(name)}</text>
      <g fill="${c.secondary}" font-family="Segoe UI,Arial,sans-serif" font-size="17"><text x="18" y="66">${esc(lines[0])}</text><text x="18" y="89">${esc(lines[1])}</text></g>
      <circle cx="22" cy="119" r="3.5" fill="${c.purple}"/><text x="34" y="124" fill="${c.purple}" font-family="Consolas,Menlo,monospace" font-size="14">${esc(prLabel(prs))}</text>
      <text x="381" y="124" text-anchor="end" fill="${c.muted}" font-family="Consolas,Menlo,monospace" font-size="12">${count} ↗</text>`));
  }
}
const picture=(slug,width,alt)=>`<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="./assets/contributions/${slug}-compact-dark.svg" />\n    <img src="./assets/contributions/${slug}-compact-light.svg" width="${width}" alt="${esc(alt)}" />\n  </picture>`;
let section = `<!-- open-source-impact:start -->\n\n## \`> contributions --merged\`\n\n<a href="${query}">\n  ${picture('impact','100%',`Open Source Impact — ${projectCount} external projects, ${prCount} merged pull requests`)}\n</a>\n\n<p align="center">\n`;
for(const [repo,name,cat,lines,prs] of projects){
  const href=prs.length===1?`https://github.com/${repo}/pull/${prs[0]}`:`https://github.com/${repo}/pulls?q=is%3Apr+is%3Amerged+author%3A${encodeURIComponent(username)}`;
  section+=`  <a href="${href}">\n    ${picture(repo.toLowerCase().replaceAll('/','--'),250,`${repo} — ${lines.join(' ')} Merged: ${prs.map(x=>'#'+x).join(', ')}.`)}\n  </a>\n`;
}
section+=`</p>\n\n<p align="center"><a href="${query}">Explore all merged contributions ↗</a></p>\n\n<!-- open-source-impact:end -->`;

function save(name, content) { files[`assets/contributions/${name}`] = content; }
return { files, section, projectCount, prCount };
}
