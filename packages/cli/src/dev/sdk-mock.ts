export interface SDKMockConfig {
  layoutSlug: string;
}

/** Serialize the SDK mock object to a JS string for injection into dev HTML */
export function serializeSDKMock(config: SDKMockConfig): string {
  const { layoutSlug } = config;
  return `
// Toast overlay
var noop=function(){};
(function(){var c=document.createElement('div');c.className='dev-toast-container';document.body.appendChild(c);window.__devToast=function(msg){var el=document.createElement('div');el.className='dev-toast';el.textContent=msg;c.appendChild(el);setTimeout(function(){el.remove()},4000)};})();

// Provider registry — plugin's own code registers here
var __p={},__pc={};

// SDK mock — matches @stallion-ai/sdk exports used by plugins
// Standalone functions (not hooks) — also exposed on the mock object for the shim
var __devApiBase='';
function __callTool(slug,tool,args){return fetch('/agents/'+encodeURIComponent(slug)+'/tools/'+encodeURIComponent(tool),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})}).then(function(r){return r.json()}).then(function(d){if(!d.success)throw new Error(d.error||'Tool call failed');return d.response})}
function __transformTool(slug,tool,args,transform){return fetch('/agents/'+encodeURIComponent(slug)+'/tool/'+encodeURIComponent(tool),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolArgs:args,transform:transform})}).then(function(r){return r.json()}).then(function(d){if(!d.success)throw new Error(d.error||'Transform failed');return d.response})}
function __invokeAgent(slug,prompt){window.__devToast&&window.__devToast('→ agent('+slug+'): '+prompt.slice(0,100));return Promise.resolve({text:'[mock]',toolCalls:[]})}
function __invoke(opts){window.__devToast&&window.__devToast('invoke: '+JSON.stringify(opts).slice(0,120));return Promise.resolve({})}
function __serverFetch(url,opts){return fetch('/api/plugins/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url,method:opts&&opts.method,headers:opts&&opts.headers,body:opts&&opts.body})}).then(function(r){return r.json()}).then(function(d){if(!d.success)throw new Error(d.error);return d})}

window.__stallion_ai_sdk_mock={
  // Hooks
  useAgents:function(){return[]},
  useAuth:function(){return{status:'valid',provider:'none',user:{alias:'dev-user',name:'Dev User'},expiresAt:null,renew:function(){return Promise.resolve()},isRenewing:false}},
  useConversations:function(){return[]},
  useOpenConversation:function(){return noop},
  useNavigation:function(){return{pathname:window.location.pathname,selectedAgent:null,selectedLayout:'${layoutSlug}',activeConversation:null,activeChat:null,activeTab:null,isDockOpen:false,isDockMaximized:false,fontSize:null,navigate:noop,updateParams:noop,setAgent:noop,setLayout:noop,setLayoutTab:function(ws,tab){if(window.__devSetTab)window.__devSetTab(tab)},setConversation:noop,setActiveChat:noop,setDockState:noop}},
  useDockState:function(){return{isOpen:false,setOpen:noop,toggle:noop}},
  useToast:function(){return{showToast:function(msg,opts){window.__devToast&&window.__devToast((opts&&opts.type?opts.type+': ':'')+msg)}}},
  useNotifications:function(){return{notify:function(msg,opts){window.__devToast&&window.__devToast((opts&&opts.type?opts.type+': ':'')+msg)},schedule:function(opts){window.__devToast&&window.__devToast('Notification: '+opts.title+(opts.body?' — '+opts.body:''));return Promise.resolve({id:'mock-'+Date.now(),source:'sdk',category:opts.category||'info',title:opts.title,status:opts.scheduledAt?'pending':'delivered',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})},dismiss:function(){return Promise.resolve()}}},
  useLayoutQuery:function(){return{data:undefined}},
  useLayoutNavigation:function(){var ls='${layoutSlug}';return{getTabState:function(t){return sessionStorage.getItem('layout-'+ls+'-tab-'+t)||''},setTabState:function(t,s){var key='layout-'+ls+'-tab-'+t;sessionStorage.setItem(key,s)},clearTabState:function(t){sessionStorage.removeItem('layout-'+ls+'-tab-'+t)}}},
  useSendToChat:function(slug){return function(msg){window.__devToast&&window.__devToast('→ chat('+slug+'): '+(typeof msg==='string'?msg:JSON.stringify(msg).slice(0,120)))}},
  useApiBase:function(){return __devApiBase},
  useServerFetch:function(){return __serverFetch},
  // Standalone functions
  callTool:__callTool,
  transformTool:__transformTool,
  invokeAgent:__invokeAgent,
  invoke:__invoke,
  // Provider registry
  registerProvider:function(id,meta,factory){__p[id]={meta:meta,factory:factory,instance:null}},
  configureProvider:function(ws,type,pid){__pc[ws+'/'+type]=pid},
  hasProvider:function(ws,type){var pid=__pc[ws+'/'+type];return !!pid&&!!__p[pid]},
  getProvider:function(ws,type){var pid=__pc[ws+'/'+type];if(!pid||!__p[pid])return null;var e=__p[pid];if(!e.instance)e.instance=typeof e.factory==='function'?e.factory():e.factory;return e.instance},
  getActiveProviderId:function(ws,type){return __pc[ws+'/'+type]||null},
  // Layout context factory
  createLayoutContext:function(opts){var init=(opts&&opts.initialState)||{};var R=window.React;var Ctx=R.createContext({state:init,setState:noop});return{Provider:function(p){return R.createElement(Ctx.Provider,{value:{state:init,setState:noop}},p.children)},useLayoutContext:function(){return R.useContext(Ctx)}}},
  // Components
  Button:function(props){return window.React.createElement('button',{onClick:props.onClick,disabled:props.disabled,className:'layout-dashboard__btn'+(props.variant?' layout-dashboard__btn--'+props.variant:''),style:props.style},props.children)},
};`;
}
