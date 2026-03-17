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
<link rel="stylesheet" href="/sdk-dev.css">
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
.info-wrap{padding:2rem 2.5rem}
.info-section{margin-bottom:1.5rem}
.info-section-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border-primary)}
.info-section-title{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);font-family:monospace}
.info-section-count{font-size:10px;padding:1px 6px;border-radius:10px;background:var(--bg-tertiary);color:var(--text-muted);font-family:monospace}
.info-empty{color:var(--text-muted);font-size:12px;font-style:italic;padding:6px 12px;font-family:monospace}
.info-top-row{display:flex;gap:1.5rem;margin-bottom:1.5rem;flex-wrap:wrap}
.info-top-col{flex:1;min-width:280px}
.info-layout-card{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:8px;text-decoration:none;color:var(--text-primary);transition:border-color .15s,background .15s;margin-bottom:6px}
.info-layout-card:hover{border-color:var(--accent-primary);background:var(--bg-hover)}
.info-layout-icon{font-size:1.8rem}
.info-layout-body{flex:1}
.info-layout-name{font-weight:600;font-size:1rem}
.info-layout-meta{font-size:11px;color:var(--text-muted);margin-top:2px;font-family:'SF Mono',Menlo,monospace}
.info-layout-arrow{font-size:1.1rem;color:var(--accent-primary);opacity:0.5;transition:opacity .15s}
.info-layout-card:hover .info-layout-arrow{opacity:1}
.info-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.info-card{padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:6px;cursor:pointer;transition:border-color .15s}
.info-card:hover{border-color:var(--accent-primary)}
.info-card-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.info-card-icon{font-size:1.1rem}
.info-card-name{font-weight:500;font-size:13px;flex:1}
.info-card-badge{font-size:9px;padding:1px 5px;border-radius:3px;border:1px solid var(--border-primary);color:var(--text-muted);font-family:'SF Mono',Menlo,monospace}
.info-card-sub{font-size:11px;color:var(--text-muted);font-family:'SF Mono',Menlo,monospace}
.info-card-detail{margin-top:8px;padding-top:8px;border-top:1px solid var(--border-primary)}
.info-action-card{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:6px;margin-bottom:6px}
.info-action-icon{font-size:1rem}
.info-action-body{flex:1;min-width:0}
.info-action-name{font-weight:500;font-size:13px}
.info-action-meta{font-size:11px;color:var(--text-muted);font-family:'SF Mono',Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info-action-badge{font-size:9px;padding:1px 5px;border-radius:3px;border:1px solid var(--border-primary);color:var(--text-muted);font-family:'SF Mono',Menlo,monospace}
.info-item{border:1px solid var(--border-primary);border-radius:6px;margin-bottom:6px;overflow:hidden;background:var(--bg-primary)}
.info-item--open{background:var(--bg-secondary)}
.info-item-header{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none}
.info-item-header:hover{background:var(--bg-hover)}
.info-item-icon{width:24px;text-align:center;flex-shrink:0}
.info-item-name{flex:1;font-weight:500}
.info-item-badge{font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid var(--border-primary);color:var(--text-muted);font-family:'SF Mono',Menlo,monospace}
.info-item-chevron{color:var(--text-muted);font-size:11px;width:16px;text-align:center}
.info-item-detail{padding:0 14px 14px;border-top:1px solid var(--border-primary)}
.info-kv{display:flex;gap:8px;padding:4px 0;font-size:13px}
.info-kv-key{color:var(--text-muted);min-width:100px;font-family:'SF Mono',Menlo,monospace;font-size:11px}
.info-kv-val{color:var(--text-primary);font-family:'SF Mono',Menlo,monospace;font-size:11px;word-break:break-all}
.info-kv-link{color:var(--accent-primary);text-decoration:none}
.info-kv-link:hover{text-decoration:underline}
.info-kv-source{opacity:0.5;font-style:italic}
.info-prompt-block{margin-top:8px}
.info-prompt-pre{margin:0;padding:12px;background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:4px;font-size:12px;font-family:'SF Mono',Menlo,monospace;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;color:var(--text-secondary);line-height:1.5}
</style>
<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');</script>
</head><body>
<div class="dev-banner">
  <div class="dev-banner-left">
    <span class="dev-banner-name" onclick="location.hash='#/'">${name}</span>
    <span id="dev-breadcrumb"></span>
  </div>
  <button class="dev-theme-btn" onclick="var t=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);this.textContent=t==='dark'?'☀️':'🌙'">☀️</button>
</div>
<div id="root"></div>
<script>
${sdkMockJs}
</script>
<script src="/react-dev.js"></script>
<script>window.require=function(m){if(m==='react')return window.React;if(m==='react-dom')return window.ReactDOM;if(m==='react/jsx-runtime')return window.__jsx;throw new Error('require not available: '+m)}</script>
<script src="/sdk-dev.js"></script>
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

  function DetailRow(props){
    var ref=React.useState(false),open=ref[0],setOpen=ref[1];
    return h('div',{className:'info-item'+(open?' info-item--open':''),onClick:function(){setOpen(!open)}},
      h('div',{className:'info-item-header'},
        h('span',{className:'info-item-icon'},props.icon),
        h('span',{className:'info-item-name'},props.name),
        props.badge&&h('span',{className:'info-item-badge'},props.badge),
        h('span',{className:'info-item-chevron'},open?'▾':'▸')
      ),
      open&&h('div',{className:'info-item-detail'},
        props.children
      )
    );
  }

  function KV(props){
    var val=props.href
      ?h('a',{className:'info-kv-val info-kv-link',href:props.href,target:'_blank',rel:'noopener noreferrer',onClick:function(e){e.stopPropagation()}},props.v)
      :h('span',{className:'info-kv-val'},props.v);
    return h('div',{className:'info-kv'},h('span',{className:'info-kv-key'},props.k),val);
  }

  function SourceLink(props){
    if(!props.path)return null;
    var href='/api/open-file?path='+encodeURIComponent(props.path);
    return h('div',{className:'info-kv'},h('span',{className:'info-kv-key'},'source'),h('a',{className:'info-kv-val info-kv-link',href:href,onClick:function(e){e.stopPropagation()}},props.path));
  }

  function gitToHttps(src){
    if(!src)return null;
    var m=src.match(/^git@([^:]+):(.+?)(\\.git)?$/);
    return m?'https://'+m[1].replace(/^ssh\\./,'')+'/'+m[2]:src.match(/^https?:/)?src:null;
  }

  function Section(props){
    return h('div',{className:'info-section'},
      h('div',{className:'info-section-header'},
        h('span',{className:'info-section-title'},props.title),
        h('span',{className:'info-section-count'},String(props.items?props.items.length:0))
      ),
      (!props.items||!props.items.length)
        ?h('div',{className:'info-empty'},'none registered')
        :props.items.map(props.render)
    );
  }

  function CardItem(props){
    var ref=React.useState(false),open=ref[0],setOpen=ref[1];
    var pills=props.pills||[];
    return h('div',{className:'info-card'+(open?' info-item--open':''),onClick:function(e){e.stopPropagation();setOpen(!open)}},
      h('div',{className:'info-card-top'},
        h('span',{className:'info-card-icon'},props.icon),
        h('span',{className:'info-card-name'},props.name),
        props.badge&&h('span',{className:'info-card-badge'},props.badge)
      ),
      props.sub&&h('div',{className:'info-card-sub'},props.sub),
      pills.length>0&&h('div',{style:{marginTop:4,display:'flex',flexWrap:'wrap',gap:3}},
        pills.map(function(u,i){
          return h('span',{key:i,style:{fontSize:10,padding:'1px 6px',borderRadius:3,background:'rgba(34,197,94,0.15)',color:'var(--accent-acp)',fontFamily:'SF Mono,Menlo,monospace'}},u.scope+' \u2192 '+u.label);
        })
      ),
      open&&h('div',{className:'info-card-detail'},props.children)
    );
  }

  function InfoPage(){
    bc.textContent='';
    var reg=registry;
    var promptMap={};
    (reg.prompts||[]).forEach(function(p){promptMap[p.id]=p});
    // Build reverse map: prompt id → list of action labels that reference it
    var promptUsage={};
    (reg.actions||[]).forEach(function(a){
      if(a.type==='prompt'){var pid=a.data.split(':').pop();if(!promptUsage[pid])promptUsage[pid]=[];promptUsage[pid].push({label:a.label,scope:'global'})}
    });
    var allTabs=(reg.layouts&&reg.layouts[0]&&Array.isArray(reg.layouts[0].tabs))?reg.layouts[0].tabs:[];
    allTabs.forEach(function(tab){
      (tab.actions||[]).forEach(function(a){
        var pid=(a.data||a.id||'').split(':').pop();if(!promptUsage[pid])promptUsage[pid]=[];promptUsage[pid].push({label:a.label||a.id,scope:tab.label||tab.id});
      });
    });
    return h('div',{className:'info-wrap'},
      // Row 1: Layout | Actions
      h('div',{className:'info-top-row'},
        h('div',{className:'info-top-col'},
          h(Section,{title:'LAYOUTS',items:reg.layouts,render:function(l){
            var tabList=Array.isArray(l.tabs)?l.tabs:[];
            var tabCount=tabList.length;
            return h('div',{key:l.slug},
              h('a',{className:'info-layout-card',href:'#/layout/'+l.slug},
                l.icon&&h('div',{className:'info-layout-icon'},l.icon),
                h('div',{className:'info-layout-body'},
                  h('div',{className:'info-layout-name'},l.name),
                  h('div',{className:'info-layout-meta'},tabCount+' tabs')
                ),
                h('span',{className:'info-layout-arrow'},'→')
              ),
              tabList.length>0&&h('div',{style:{marginTop:6,marginBottom:12}},tabList.map(function(tab){
                var actions=tab.actions||[];
                return h('div',{key:tab.id,style:{padding:'10px 14px',marginBottom:4,background:'var(--bg-secondary)',border:'1px solid var(--border-primary)',borderRadius:6}},
                  h('div',{style:{display:'flex',alignItems:'center',gap:8}},
                    tab.icon&&h('span',null,tab.icon),
                    h('span',{style:{fontWeight:500,fontSize:13}},tab.label),
                    h('span',{className:'info-card-badge'},tab.component)
                  ),
                  actions.length>0&&h('div',{style:{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border-primary)'}},
                    actions.map(function(a,i){
                      var pid=(a.id||'').split(':').pop();
                      var linked=promptMap[pid];
                      return h('div',{key:i,className:'info-action-card',style:{marginBottom:4}},
                        a.icon&&h('span',{className:'info-action-icon'},a.icon),
                        h('div',{className:'info-action-body'},
                          h('div',{className:'info-action-name'},a.label||a.id),
                          h('div',{className:'info-action-meta'},a.id||'')
                        ),
                        h('span',{className:'info-action-badge'},'tab action')
                      );
                    })
                  )
                );
              }))
            );
          }})
        ),
        h('div',{className:'info-top-col'},
          h(Section,{title:'ACTIONS',items:reg.actions,render:function(a,i){
            return h('div',{key:i,className:'info-action-card'},
              a.icon&&h('span',{className:'info-action-icon'},a.icon),
              h('div',{className:'info-action-body'},
                h('div',{className:'info-action-name'},a.label),
                h('div',{className:'info-action-meta'},a.type==='external'?h('a',{className:'info-kv-link',href:a.data,target:'_blank',rel:'noopener noreferrer'},a.data):a.data)
              ),
              h('span',{className:'info-action-badge'},a.type)
            );
          }})
        )
      ),
      // Row 2: Agents
      h(Section,{title:'AGENTS',items:reg.agents,render:function(a){
        return h(CardItem,{key:a.slug,icon:a.icon||'',name:a.name,badge:a.model?a.model.split('.').pop():'',sub:a.slug+(a.mcpServers&&a.mcpServers.length?' · '+a.mcpServers.join(', '):'')},
          a.model&&h(KV,{k:'model',v:a.model}),
          a.guardrails&&h(KV,{k:'maxTokens',v:String(a.guardrails.maxTokens||'')}),
          a.guardrails&&h(KV,{k:'temperature',v:String(a.guardrails.temperature||'')}),
          a.prompt&&h('pre',{className:'info-prompt-pre',style:{margin:'4px 0 8px'}},a.prompt),
          h(SourceLink,{path:a._source})
        );
      }}),
      // Row 3: Integrations | Prompts
      h('div',{className:'info-top-row'},
        h('div',{className:'info-top-col'},
          h(Section,{title:'INTEGRATIONS',items:reg.integrations,render:function(ig){
            var cmd=ig.command+(ig.args&&ig.args.length?' '+ig.args.join(' '):'');
            return h(CardItem,{key:ig.id,icon:ig.icon||'',name:ig.displayName||ig.id,badge:ig.id,sub:cmd},
              ig.description&&h(KV,{k:'description',v:ig.description}),
              ig.kind&&h(KV,{k:'kind',v:ig.kind}),
              ig.transport&&h(KV,{k:'transport',v:ig.transport}),
              ig.permissions&&h(KV,{k:'permissions',v:JSON.stringify(ig.permissions)}),
              h(SourceLink,{path:ig._source})
            );
          }})
        ),
        h('div',{className:'info-top-col'},
          h(Section,{title:'PROMPTS',items:reg.prompts,render:function(p){
            var usage=promptUsage[p.id]||[];
            return h(CardItem,{key:p.id,icon:p.icon||'',name:p.name,badge:p.requires?p.requires.join(', '):'',sub:p.id,pills:usage},
              p.content&&h('pre',{className:'info-prompt-pre',style:{margin:'4px 0 8px'}},p.content),
              h(SourceLink,{path:p._source})
            );
          }})
        )
      ),
      // Row 4: Dependencies
      h(Section,{title:'DEPENDENCIES',items:reg.dependencies,render:function(d){
        var href=gitToHttps(d.source);
        var hasDetail=reg.depRegistries&&reg.depRegistries[d.id];
        return h('a',{key:d.id,className:'info-layout-card',href:hasDetail?'#/dep/'+d.id:(href||'#'),target:hasDetail?undefined:'_blank',rel:hasDetail?undefined:'noopener noreferrer',style:{textDecoration:'none'}},
          h('div',{className:'info-layout-body'},
            h('div',{className:'info-layout-name'},d.id),
            h('div',{className:'info-layout-meta'},d.source||'local')
          ),
          hasDetail&&h('span',{className:'info-layout-arrow'},'→')
        );
      }})
    );
  }

  var __sdkComponents = window.__stallion_sdk || {};
  var SDKProvider = __sdkComponents.SDKProvider;
  var LayoutHeader = __sdkComponents.LayoutHeader;

  // Build SDK context value for dev mode (mirrors real app's context injection)
  var __devSDKContext = {
    apiBase: '',
    contexts: {
      navigation: { useNavigation: __sdkMock.useNavigation },
      auth: { useAuth: __sdkMock.useAuth },
      toast: { useToast: __sdkMock.useToast },
    },
    hooks: {}
  };

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
    var globalActions=registry.actions||[];
    var tabActions=(td&&td.actions)||[];

    function handleAction(a){
      if(a.type==='external'){window.open(a.data,'_blank');return}
      window.__devToast('Prompt: '+(a.label||a.data||'action'));
    }

    return React.createElement(React.Fragment,null,
      h(LayoutHeader,{
        layoutName:layoutName,
        tabs:tabs.map(function(t){return{id:t.id,label:t.label,icon:t.icon}}),
        activeTabId:activeTab,
        onTabChange:setActiveTab,
        actions:globalActions,
        onLaunchAction:handleAction,
        title:td?td.label:layoutName,
        description:'',
        tabActions:tabActions,
        onTabPromptSelect:handleAction
      }),
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
    var d=hash.match(new RegExp('^/dep/(.+)$'));
    if(d)return{view:'dep',depId:d[1]};
    return{view:'info'};
  }

  function DepPage(props){
    var depId=props.depId;
    var depReg=registry.depRegistries&&registry.depRegistries[depId];
    var depName=depReg?depReg.name:depId;
    bc.innerHTML='<span class="dev-banner-sep"> › </span><span class="dev-banner-crumb">'+depName+'</span>';
    if(!depReg)return h('div',{className:'info-wrap'},h('div',{className:'dev-error'},'No data found for dependency: '+depId));
    var promptMap={};
    (depReg.prompts||[]).forEach(function(p){promptMap[p.id]=p});
    return h('div',{className:'info-wrap'},
      // Row 1: Layout | Actions
      h('div',{className:'info-top-row'},
        h('div',{className:'info-top-col'},
          h(Section,{title:'LAYOUTS',items:depReg.layouts,render:function(l){
            var tabList=Array.isArray(l.tabs)?l.tabs:[];
            return h('div',{key:l.slug},
              h('div',{className:'info-layout-card'},
                l.icon&&h('div',{className:'info-layout-icon'},l.icon),
                h('div',{className:'info-layout-body'},
                  h('div',{className:'info-layout-name'},l.name),
                  h('div',{className:'info-layout-meta'},tabList.length+' tabs')
                )
              ),
              tabList.length>0&&h('div',{style:{marginTop:6,marginBottom:12}},tabList.map(function(tab){
                return h('div',{key:tab.id,style:{padding:'10px 14px',marginBottom:4,background:'var(--bg-secondary)',border:'1px solid var(--border-primary)',borderRadius:6}},
                  h('div',{style:{display:'flex',alignItems:'center',gap:8}},
                    tab.icon&&h('span',null,tab.icon),
                    h('span',{style:{fontWeight:500,fontSize:13}},tab.label),
                    h('span',{className:'info-card-badge'},tab.component)
                  )
                );
              }))
            );
          }})
        ),
        h('div',{className:'info-top-col'},
          h(Section,{title:'ACTIONS',items:depReg.actions,render:function(a,i){
            return h('div',{key:i,className:'info-action-card'},
              a.icon&&h('span',{className:'info-action-icon'},a.icon),
              h('div',{className:'info-action-body'},
                h('div',{className:'info-action-name'},a.label),
                h('div',{className:'info-action-meta'},a.data||'')
              ),
              h('span',{className:'info-action-badge'},a.type)
            );
          }})
        )
      ),
      // Agents
      h(Section,{title:'AGENTS',items:depReg.agents,render:function(a){
        return h(CardItem,{key:a.slug,icon:'',name:a.name,badge:a.model?a.model.split('.').pop():'',sub:a.slug+(a.mcpServers&&a.mcpServers.length?' · '+a.mcpServers.join(', '):'')},
          a.model&&h(KV,{k:'model',v:a.model}),
          a.prompt&&h('pre',{className:'info-prompt-pre',style:{margin:'4px 0 8px'}},a.prompt),
          h(SourceLink,{path:a._source})
        );
      }}),
      // Integrations | Prompts
      h('div',{className:'info-top-row'},
        h('div',{className:'info-top-col'},
          h(Section,{title:'INTEGRATIONS',items:depReg.integrations,render:function(ig){
            var cmd=ig.command+(ig.args&&ig.args.length?' '+ig.args.join(' '):'');
            return h(CardItem,{key:ig.id,icon:'',name:ig.displayName||ig.id,badge:ig.id,sub:cmd},
              ig.description&&h(KV,{k:'description',v:ig.description}),
              h(SourceLink,{path:ig._source})
            );
          }})
        ),
        h('div',{className:'info-top-col'},
          h(Section,{title:'PROMPTS',items:depReg.prompts,render:function(p){
            return h(CardItem,{key:p.id,icon:p.icon||'',name:p.name,badge:'',sub:p.id},
              p.content&&h('pre',{className:'info-prompt-pre',style:{margin:'4px 0 8px'}},p.content),
              h(SourceLink,{path:p._source})
            );
          }})
        )
      ),
      // Providers
      depReg.providers&&depReg.providers.length>0&&h(Section,{title:'PROVIDERS',items:depReg.providers,render:function(p,i){
        return h(CardItem,{key:i,icon:'',name:p.type,badge:'provider',sub:h('a',{className:'info-kv-link',href:'/api/open-file?path='+encodeURIComponent(p._source||p.module),onClick:function(e){e.stopPropagation()}},p.module)});
      }}),
      // Dependencies
      h(Section,{title:'DEPENDENCIES',items:depReg.dependencies,render:function(d){
        return h('div',{key:d.id,className:'info-action-card'},
          h('div',{className:'info-action-body'},
            h('div',{className:'info-action-name'},d.id),
            h('div',{className:'info-action-meta'},d.source||'local')
          )
        );
      }})
    );
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
      :route.view==='dep'
      ?h(DepPage,{depId:route.depId})
      :h(InfoPage,null);
    return RQ&&RQ.QueryClientProvider
      ?h(RQ.QueryClientProvider,{client:window.__devQC||(window.__devQC=new RQ.QueryClient())},inner)
      :inner;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    h(SDKProvider,{value:__devSDKContext},h(DevShell,null))
  );
})();
</script>
<script>(function(){var es=new EventSource('/api/reload');es.onmessage=function(e){if(e.data==='reload')location.reload()}})()</script>
</body></html>`;
}
