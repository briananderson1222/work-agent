export interface DevTemplateOptions {
  name: string;
  pluginName: string;
  tabsJson: string;
  agentInfo: string;
  layoutSlug: string;
  sdkMockJs: string;
}

/** Generate the dev preview HTML page */
export function generateDevHTML(opts: DevTemplateOptions): string {
  const { name, pluginName, tabsJson, agentInfo, sdkMockJs } = opts;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${name} — Dev Preview</title>
<link rel="stylesheet" href="/bundle.css">
<style>
body{margin:0;font-family:system-ui;background:var(--bg-primary);color:var(--text-primary)}
:root,[data-theme="dark"]{--bg-primary:#1a1a1a;--bg-secondary:#242424;--bg-tertiary:#2a2a2a;--bg-elevated:#333;--bg-hover:#2a2a2a;--bg-highlight:#1e3a5f;--bg-modal:#242424;--bg-input:#1a1a1a;--text-primary:#e0e0e0;--text-secondary:#d0d0d0;--text-muted:#999;--text-tertiary:#9c9c9c;--border-primary:#333;--border-dashed:#444;--accent-primary:#4a9eff;--accent-acp:#22c55e;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
[data-theme="light"]{--bg-primary:#fff;--bg-secondary:#f5f5f5;--bg-tertiary:#eee;--bg-elevated:#fafafa;--bg-hover:#f0f0f0;--bg-highlight:#e8f0fe;--bg-modal:#fff;--bg-input:#fff;--text-primary:#1a1a1a;--text-secondary:#333;--text-muted:#999;--text-tertiary:#666;--border-primary:#e0e0e0;--border-dashed:#d0d0d0;--accent-primary:#0066cc;--accent-acp:#16a34a;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
.dev-banner{background:var(--bg-secondary);border-bottom:1px solid var(--accent-primary);padding:8px 16px;font-size:13px;color:var(--accent-primary);display:flex;align-items:center;justify-content:space-between}
.dev-tabs{display:flex;background:var(--bg-secondary);border-bottom:1px solid var(--border-primary)}
.dev-tab{padding:10px 20px;cursor:pointer;border:none;background:none;color:var(--text-muted);font-size:14px;border-bottom:2px solid transparent;font-family:inherit}
.dev-tab:hover{color:var(--text-primary);background:var(--bg-hover)}
.dev-tab.active{color:var(--accent-primary);border-bottom-color:var(--accent-primary)}
.dev-tab-content{min-height:calc(100vh - 80px)}
.dev-error{padding:2rem;color:#ef4444}
.dev-theme-btn{background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:14px}
.dev-toast-container{position:fixed;top:48px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.dev-toast{background:var(--bg-elevated);border:1px solid var(--accent-primary);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--accent-primary);max-width:400px;word-break:break-all;animation:toast-in .3s ease}
@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
</style>
<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');</script>
</head><body>
<div class="dev-banner">
  <span>🔧 <strong>${name}</strong> — Dev Preview${agentInfo ? ` · <span style="opacity:0.7">🤖 ${agentInfo}</span>` : ''}</span>
  <button class="dev-theme-btn" onclick="var t=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);this.textContent=t==='dark'?'☀️':'🌙'">☀️</button>
</div>
<div id="root"></div>
<script>
${sdkMockJs}
</script>
<script src="/react-dev.js"></script>
<script>
// Bridge: populate __stallion_ai_shared so the plugin bundle's own require shim finds them
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
  var plugin=window.__stallion_ai_plugins&&window.__stallion_ai_plugins['${pluginName}'];
  if(!plugin){document.getElementById('root').innerHTML='<div class="dev-error">Plugin failed to load. Check console.</div>';return}
  var React=window.React,ReactDOM=window.ReactDOM;
  var RQ=window.__stallion_ai_rq;
  var tabs=${tabsJson};
  function DevShell(){
    var ref=React.useState(tabs[0]?tabs[0].id:null),activeTab=ref[0],setActiveTab=ref[1];
    window.__devSetTab=setActiveTab;
    var comps=plugin.components||{};
    var td=tabs.find(function(t){return t.id===activeTab});
    var C=td?comps[td.component]:null;
    var inner=React.createElement(React.Fragment,null,
      React.createElement('div',{className:'dev-tabs'},tabs.map(function(t){return React.createElement('button',{key:t.id,className:'dev-tab'+(activeTab===t.id?' active':''),onClick:function(){setActiveTab(t.id)}},t.label)})),
      React.createElement('div',{className:'dev-tab-content'},C?React.createElement(EB,{key:activeTab},React.createElement(C,{onShowChat:noop})):React.createElement('div',{style:{padding:'2rem',color:'var(--text-muted)'}},'No component: '+(td?td.component:activeTab)))
    );
    return RQ&&RQ.QueryClientProvider?React.createElement(RQ.QueryClientProvider,{client:window.__devQC||(window.__devQC=new RQ.QueryClient())},inner):inner;
  }
  class EB extends React.Component{constructor(p){super(p);this.state={e:null}}static getDerivedStateFromError(e){return{e:e}}render(){return this.state.e?React.createElement('div',{className:'dev-error'},React.createElement('strong',null,'Error: '),this.state.e.message,React.createElement('pre',{style:{fontSize:12,marginTop:8,color:'var(--text-muted)'}},this.state.e.stack)):this.props.children}}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DevShell));
})();
</script>
<script>(function(){var es=new EventSource('/api/reload');es.onmessage=function(e){if(e.data==='reload')location.reload()}})()</script>
</body></html>`;
}
