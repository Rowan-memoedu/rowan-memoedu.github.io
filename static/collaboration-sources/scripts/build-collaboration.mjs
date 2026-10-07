import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildSync} from 'esbuild';
import postcss from 'postcss';
import less from 'less';
import {transform,Features} from 'lightningcss';

const root=path.resolve('sample/upstream/collaboration'),plate=path.join(root,'plate');
const read=file=>fs.readFileSync(file,'utf8');
const strip=css=>css.replace(/^\s*@import[^;]*;/gm,'');
export async function buildCollaboration(outputDirectory){
  fs.mkdirSync(outputDirectory,{recursive:true});
  for(const s of JSON.parse(read(path.join(root,'manifest.json'))).sources){assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,s.path))).digest('hex'),s.sha256,'Pinned collaboration source changed');}
  const result=buildSync({entryPoints:['sample/protected-reader.mjs'],bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',minify:true,jsx:'automatic',jsxImportSource:'react',tsconfigRaw:{compilerOptions:{jsx:'react-jsx',jsxImportSource:'react'}},outdir:outputDirectory,chunkNames:'collaboration-chunks/[name]-[hash]',assetNames:'collaboration-fonts/[name]-[hash]',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},alias:{katex:'katex-collaboration','@/components/ui/popover':path.resolve('sample/collaboration/popover.tsx'),'@':plate},metafile:true});
  assert(!Object.keys(result.metafile.inputs).some(file=>file.includes('node_modules/preact/')),'Editor must use the React runtime, isolated from Quartz Preact');
  assert(!Object.keys(result.metafile.inputs).some(file=>file.includes('node_modules/katex/')),'User-authored collaboration formulas must use the patched KaTeX runtime');
  assert(!Object.values(result.metafile.outputs).some(x=>x.imports.some(i=>i.external)),'Collaboration dependencies must be local');
  const parsed=postcss.parse(read(path.join(plate,'globals.css')));
  const theme=parsed.nodes.find(n=>n.type==='atrule'&&n.name==='theme').toString();
  const tokens=parsed.nodes.find(n=>n.type==='rule'&&n.selector===':root').clone({selector:'.collaboration-ui'}).toString();
  const intermediates=path.resolve('D:/Artifacts/PersonalWebsite/collaboration-build');fs.mkdirSync(intermediates,{recursive:true});
  const themeInput=path.join(intermediates,'collaboration-theme.input.css'),unscoped=path.join(intermediates,'collaboration-theme.generated.css');
  const absolute=file=>path.resolve(file).replaceAll('\\','/');
  fs.writeFileSync(themeInput,`@layer theme,base,components,utilities;\n@import "${absolute('node_modules/tailwindcss/theme.css')}" layer(theme);\n@import "${absolute('node_modules/tailwindcss/preflight.css')}" layer(base);\n@import "${absolute('node_modules/tailwindcss/utilities.css')}" layer(utilities) source(none);\n@source "${absolute('sample/collaboration')}";\n@source "${absolute(plate)}";\n${theme}\n`);
  execFileSync(process.execPath,['node_modules/@tailwindcss/cli/dist/index.mjs','-i',themeInput,'-o',unscoped],{stdio:'inherit',windowsHide:true});
  // Lower nesting first, then namespace every utility selector, including portals.
  const flattened=transform({filename:unscoped,code:fs.readFileSync(unscoped),include:Features.Nesting,minify:false}).code.toString();
  const css=postcss.parse(flattened);
  css.walkRules(rule=>{
    if(rule.parent?.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
    if(rule.selector===':root, :host'||rule.selector===':root,:host'){rule.selector='.collaboration-ui';return;}
    rule.selectors=rule.selectors.flatMap(s=>[s==='*'?'.collaboration-ui':/^[.[:]/u.test(s)?'.collaboration-ui'+s:null,'.collaboration-ui '+s].filter(Boolean));
  });
  const recent=path.resolve('sample/upstream/recent-changes');
  const echo=path.join(root,'echo/modules');
  const echoCss=await less.render([
    strip(read(path.join(recent,'mediawiki-skin.defaults.less'))),
    strip(read(path.join(recent,'mediawiki-mixins.less'))),
    read(path.join(echo,'echo.variables.less')),read(path.join(echo,'echo.mixins.less')),
    ...['nojs/mw.echo.badge.less','styles/mw.echo.ui.NotificationItemWidget.less','styles/mw.echo.ui.NotificationsListWidget.less'].map(f=>strip(read(path.join(echo,f))))
  ].join('\n'),{javascriptEnabled:false});
  const style=path.join(outputDirectory,'collaboration.css');fs.writeFileSync(style,css.toString()+'\n'+tokens+'\n'+echoCss.css+'\n'+read('sample/collaboration/compatibility.css'));
  const licenses=path.join(outputDirectory,'collaboration-licenses.txt');
  fs.writeFileSync(licenses,['Plate registry','MIT',read(path.join(plate,'LICENSE')),'MediaWiki Echo',read(path.join(root,'echo/COPYING')),'KaTeX',read('node_modules/katex-collaboration/LICENSE')].join('\n'));
  return {outputs:[...Object.keys(result.metafile.outputs),style,licenses],metafile:result.metafile};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/u,'$1'))){await buildCollaboration(path.resolve(process.argv[2]??'D:/Artifacts/PersonalWebsite/collaboration-development-20261007/browser/static'));}
