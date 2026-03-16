export interface DevTemplateOptions {
  name: string;
  pluginName: string;
  tabsJson: string;
  registryJson: string;
  layoutSlug: string;
  sdkMockJs: string;
}

/** Generate the dev preview HTML page */
export function generateDevHTML(opts: DevTemplateOptions): string {
  const { name, pluginName, tabsJson, registryJson, sdkMockJs } = opts;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${name} — Dev Preview</title>
<link rel="stylesheet" href="/bundle.css">
<style>
body{margin:0;font-family:system-ui;background:var(--bg-primary);color:var(--text-primary)}
:root,[data-theme="dark"]{--bg-primary:#1a1a1a;--bg-secondary:#242424;--bg-tertiary:#2a2a2a;--bg-elevated:#333;--bg-hover:#2a2a2a;--bg-highlight:#1e3a5f;--bg-modal:#242424;--bg-input:#1a1a1a;--text-primary:#e0e0e0;--text-secondary:#d0d0d0;--text-muted:#999;--text-tertiary:#9c9c9c;--border-primary:#333;--border-dashed:#444;--accent-primary:#4a9eff;--accent-acp:#22c55e;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
[data-theme="light"]{--bg-primary:#fff;--bg-secondary:#f5f5f5;--bg-tertiary:#eee;--bg-elevated:#fafafa;--bg-hover:#f0f0f0;--bg-highlight:#e8f0fe;--bg-modal:#fff;--bg-input:#fff;--text-primary:#1a1a1a;--text-secondary:#333;--text-muted:#999;--text-tertiary:#666;--border-primary:#e0e0e0;--border-dashed:#d0d0d0;--accent-primary:#0066cc;--accent-acp:#16a34a;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
.dev-banner{background:var(--bg-secondary);border-bottom:2px solid var(--border-primary);padding:8px 16px;font-size:13px;display:flex;align-items:center;justify-content:space-between;font-family:monospace}
.dev-banner-left{display:flex;align-items:center;gap:8px}
.dev-banner-name{color:var(--accent-primary);cursor:pointer;font-weight:700;letter-spacing:.02em}
.dev-banner-name:hover{text-decoration:underline}
.dev-banner-sep{color:var(--text-muted);margin:0 2px}
.dev-banner-crumb{color:var(--text-secondary);font-size:12px}
.dev-theme-btn{background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:14px;color:var(--text-primary)}
.dev-tabs{display:flex;background:var(--bg-secondary);border-bottom:1px solid var(--border-primary)}
.dev-tab{padding:10px 20px;cursor:pointer;border:none;background:none;color:var(--text-muted);font-size:14px;border-bottom:2px solid transparent;font-family:inherit}
.dev-tab:hover{color:var(--text-primary);background:var(--bg-hover)}
.dev-tab.active{color:var(--accent-primary);border-bottom-color:var(--accent-primary)}
.dev-tab-content{min-height:calc(100vh - 80px)}
.dev-error{padding:2rem;color:#ef4444}
.info-wrap{padding:2rem 2.5rem;max-width:860px}
.info-section{margin-bottom:1.5rem}
.info-section-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border-primary)}
.info-section-title{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);font-family:monospace}
.info-section-count{font-size:10px;padding:1px 6px;border-radius:10px;background:var(--bg-tertiary);color:var(--text-muted);font-family:monospace}
.info-grid{display:grid;gap:6px}
.info-row{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-left:3px solid var(--border-primary);border-radius:0 4px 4px 0;transition:border-color .15s}
.info-row:hover{border-left-color:var(--accent-primary)}
.info-row-icon{font-size:1rem;text-align:center}
.info-row-body{min-width:0}
.info-row-name{font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info-row-meta{font-size:11px;color:var(--text-muted);font-family:monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info-row-badge{font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid var(--border-primary);color:var(--text-muted);font-family:monospace;white-space:nowrap}
.info-row-open{font-size:12px;color:var(--accent-primary);text-decoration:none;cursor:pointer;font-family:monospace;font-weight:600;padding:3px 8px;border:1px solid var(--accent-primary);border-radius:3px;white-space:nowrap}
.info-row-open:hover{background:var(--bg-highlight)}
.info-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent-acp);margin-right:6px;flex-shrink:0}
.info-empty{color:var(--text-muted);font-size:12px;font-style:italic;padding:6px 12px;font-family:monospace}
</style>
<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');</script>
</head><body>
<div class="dev-banner">
  <div class="dev-banner-left">
    <span class="dev-banner-name" onclick="location.hash='#/'">🔧 ${name}</span>
    <span id="dev-breadcrumb"></span>
  </div>
  <button class="dev-theme-btn" onclick="var t=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);this.textContent=t==='dark'?'☀️':'🌙'">☀️</button>
</div>
<div id="root"></div>
<script>
${sdkMockJs}
</script>
<script src="/react-dev.js"></script>
<script>
var __sdkMock = window.__stallion_ai_sdk_mock;
window.__stallion_ai_shared = {
  'react': window.React,
  'react/jsx-runtime': window.__jsx,
  'react/jsx-dev-runtime': window.__jsxDev,
  'react-dom': window.ReactDOM,
  'react-dom/client': window.ReactDOM,
  '@tanstack/react-query': window.__stallion_ai_rq,
  '@stallion-ai/sdk': Object.assign({}, __sdkMock, {default:__sdkMock, __esModule:true}),
  '@stallion-ai/components': new Proxy({}, {get: function() { return function() { return null; }; }}),
  'dompurify': {sanitize:function(s){return s},default:{sanitize:function(s){return s}}},
  'debug': function(){return function(){}},
  'zod': window.__stallion_ai_zod
};
</script>
<script src="/bundle.js"></script>
<script>
(function(){
  function noop(){}
  var plugin=window.__stallion_ai_plugins&&window.__stallion_ai_plugins['${pluginName}'];
  if(!plugin){document.getElementById('root').innerHTML='<div class="dev-error">Plugin failed to load. Check console.</div>';return}
  var React=window.React,ReactDOM=window.ReactDOM,RQ=window.__stallion_ai_rq;
  var tabs=${tabsJson};
  var registry=${registryJson};
  var bc=document.getElementById('dev-breadcrumb');

  class EB extends React.Component{
    constructor(p){super(p);this.state={e:null}}
    static getDerivedStateFromError(e){return{e:e}}
    render(){return this.state.e?React.createElement('div',{className:'dev-error'},React.createElement('strong',null,'Error: '),this.state.e.message,React.createElement('pre',{style:{fontSize:12,marginTop:8,color:'var(--text-muted)'}},this.state.e.stack)):this.props.children}
  }

  function h(t,p){var a=Array.prototype.slice.call(arguments,2);return React.createElement.apply(React,[t,p].concat(a))}

  function InfoRow(props){
    return h('div',{className:'info-row'},
      h('div',{className:'info-row-icon'},props.icon),
      h('div',{className:'info-row-body'},
        h('div',{className:'info-row-name'},h('span',{className:'info-dot'}),props.name),
        props.meta&&h('div',{className:'info-row-meta'},props.meta)
      ),
      props.action||h('span',{className:'info-row-badge'},props.badge)
    );
  }

  function Section(props){
    return h('div',{className:'info-section'},
      h('div',{className:'info-section-header'},
        h('span',{className:'info-section-title'},props.title),
        h('span',{className:'info-section-count'},String(props.items?props.items.length:0))
      ),
      h('div',{className:'info-grid'},
        (!props.items||!props.items.length)
          ?h('div',{className:'info-empty'},'none registered')
          :props.items.map(props.render)
      )
    );
  }

  function InfoPage(){
    bc.textContent='';
    var reg=registry;
    return h('div',{className:'info-wrap'},
      h(Section,{title:'Agents',items:reg.agents,render:function(a){
        return h(InfoRow,{key:a.slug,icon:'🤖',name:a.name,meta:a.slug+(a.model?' · '+a.model:''),badge:'agent'});
      }}),
      h(Section,{title:'Prompts',items:reg.prompts,render:function(p){
        return h(InfoRow,{key:p.id,icon:p.icon||'📋',name:p.name,meta:p.id+(p.requires?' · requires: '+p.requires.join(', '):''),badge:'prompt'});
      }}),
      h(Section,{title:'Actions',items:reg.actions,render:function(a,i){
        return h(InfoRow,{key:i,icon:a.icon||'⚡',name:a.label,meta:a.type+': '+a.data,badge:a.type});
      }}),
      h(Section,{title:'Dependencies',items:reg.dependencies,render:function(d){
        return h(InfoRow,{key:d.id,icon:'🔌',name:d.id,meta:d.source||'local',badge:'dep'});
      }}),
      h(Section,{title:'Layouts',items:reg.layouts,render:function(l){
        return h(InfoRow,{key:l.slug,icon:l.icon||'🖼',name:l.name,meta:l.slug+' · '+l.tabs+' tabs',
          action:h('a',{className:'info-row-open',href:'#/layout/'+l.slug},'Open →')});
      }})
    );
  }

  function LayoutView(props){
    var slug=props.slug;
    var layout=registry.layouts&&registry.layouts.find(function(l){return l.slug===slug});
    var layoutName=layout?layout.name:slug;
    bc.innerHTML='<span class="dev-banner-sep"> › </span><span class="dev-banner-crumb">'+layoutName+'</span>';
    var ref=React.useState(tabs[0]?tabs[0].id:null),activeTab=ref[0],setActiveTab=ref[1];
    window.__devSetTab=setActiveTab;
    var comps=plugin.components||{};
    var td=tabs.find(function(t){return t.id===activeTab});
    var C=td?comps[td.component]:null;
    return React.createElement(React.Fragment,null,
      h('div',{className:'dev-tabs'},tabs.map(function(t){
        return h('button',{key:t.id,className:'dev-tab'+(activeTab===t.id?' active':''),onClick:function(){setActiveTab(t.id)}},t.label);
      })),
      h('div',{className:'dev-tab-content'},
        C?h(EB,{key:activeTab},h(C,{onShowChat:noop}))
         :h('div',{style:{padding:'2rem',color:'var(--text-muted)'}},'No component: '+(td?td.component:activeTab))
      )
    );
  }

  function getRoute(){
    var hash=location.hash.replace(/^#/,'');
    var m=hash.match(new RegExp('^/layout/(.+)$'));
    if(m)return{view:'layout',slug:m[1]};
    return{view:'info'};
  }

  function DevShell(){
    var ref=React.useState(getRoute),route=ref[0],setRoute=ref[1];
    window.__devShowInfo=function(){location.hash='#/'};
    React.useEffect(function(){
      function onHash(){setRoute(getRoute())}
      window.addEventListener('hashchange',onHash);
      return function(){window.removeEventListener('hashchange',onHash)};
    },[]);
    var inner=route.view==='layout'
      ?h(LayoutView,{slug:route.slug})
      :h(InfoPage,null);
    return RQ&&RQ.QueryClientProvider
      ?h(RQ.QueryClientProvider,{client:window.__devQC||(window.__devQC=new RQ.QueryClient())},inner)
      :inner;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(DevShell,null));
})();
</script>
<script>(function(){var es=new EventSource('/api/reload');es.onmessage=function(e){if(e.data==='reload')location.reload()}})()</script>
</body></html>`;
}
