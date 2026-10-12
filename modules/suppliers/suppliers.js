(()=>{'use strict';const C=SupplierCore,$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),key='jst-suppliers-v1';let state={version:1,suppliers:[],tiers:{},weights:{...C.weights}},selected=null,editing=null,demand=null,results=[],pendingImport=[],pendingBackup=null,tierPreview=null;const labels=Object.fromEntries(C.fields.map(f=>[f[0],f[1]]));
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}const sharedMode=location.protocol==='http:'||location.protocol==='https:',apiMode=sharedMode&&/^(127\.0\.0\.1|localhost)$/.test(location.hostname),staticKey='jst-suppliers-static-v1';
let revision=0,ready=!sharedMode||!apiMode,saving=false,refreshing=false;
function normalizeState(saved){if(saved.version!==1||!Array.isArray(saved.suppliers))throw Error('资料格式无效');return {...saved,suppliers:saved.suppliers.map(C.normalize),weights:{...C.weights,...saved.weights}};}
function storageStatus(text,error=false){if(error&&storageStatus.lastError!==text)toast(text);storageStatus.lastError=error?text:'';}
async function refreshShared(initial=false){
  if(refreshing||saving)return;
  if(!apiMode){return refreshStatic(initial);}
  if(!initial&&(document.querySelector('dialog[open]')||document.activeElement?.closest('#tiers, #matchForm')))return;
  refreshing=true;
  try{const response=await fetch('/api/suppliers/state',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('共享服务未响应');const data=await response.json();if(saving)return;if(initial||data.revision>revision){state=normalizeState(data.state);revision=data.revision;render();}ready=true;storageStatus('共享数据库已连接 · 自动同步 · 版本 '+revision);}
  catch(error){storageStatus('共享服务连接失败，请运行“启动共享平台”；原资料不会被覆盖。',true);if(initial)toast('暂时无法读取共享资料，请启动本地服务后刷新');}
  finally{refreshing=false;}
}
async function refreshStatic(initial=false){
  if(!initial)return;
  refreshing=true;
  try{const response=await fetch('supplier-data.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('供应商静态数据未发布');const data=await response.json();let saved=null;try{saved=JSON.parse(localStorage.getItem(staticKey)||'null');}catch(error){}const source=saved&&saved.revision===data.revision&&saved.state?saved:data;state=normalizeState(source.state);revision=data.revision;ready=true;render();storageStatus(saved&&saved.revision===data.revision?'公开版 · 已载入本浏览器保存的供应商资料':'公开版 · 已载入发布时供应商资料 · 可筛选、匹配和本机临时编辑');}
  catch(error){ready=true;render();storageStatus('供应商静态数据读取失败：'+error.message,true);}
  finally{refreshing=false;}
}
async function persist(next=state){
  if(!sharedMode){try{localStorage.setItem(key,JSON.stringify(next));state=next;return true;}catch(e){toast('保存失败，请导出备份');return false;}}
  if(!apiMode){try{localStorage.setItem(staticKey,JSON.stringify({revision,state:next}));state=normalizeState(next);render();toast('已保存到当前浏览器；公开版不会写回共享数据库');return true;}catch(e){toast('保存失败，请导出备份');return false;}}
  if(!ready){toast('共享数据尚未加载，请启动服务并刷新页面');return false;}
  if(saving){toast('正在保存，请稍候');return false;}saving=true;
  try{const response=await fetch('/api/suppliers/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,state:next}),signal:AbortSignal.timeout(10000)});const data=await response.json();if(response.status===409){state=normalizeState(data.state);revision=data.revision;render();toast('其他浏览器已更新资料；已读取最新版本。你的表单仍保留，请核对后再次保存。');return false;}if(!response.ok)throw Error(data.error||'保存失败');state=normalizeState(data.state);revision=data.revision;storageStatus('已保存到共享数据库 · 版本 '+revision);return true;}
  catch(error){toast('未保存到共享库：'+error.message+'。请保持表单并恢复服务后重试。');storageStatus('共享服务暂不可用，修改尚未保存',true);return false;}
  finally{saving=false;}
}
async function initializeStorage(){
  if(sharedMode){storageStatus(apiMode?'正在连接共享数据库…':'正在读取公开版供应商资料…');await refreshShared(true);if(apiMode){setInterval(()=>refreshShared(!ready),8000);window.addEventListener('focus',()=>refreshShared(!ready));}}
  else{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved)state=normalizeState(saved);}catch(error){toast('本地资料读取失败：'+error.message);}render();storageStatus('当前是浏览器本地版。跨浏览器共享请使用右侧“打开共享版”；旧资料可导出后在共享版导入。');}
}
function value(s,k,unit=''){return C.known(s[k])?esc(s[k])+unit:'待完善';}function empty(symbol,title,text){
  const drawing=symbol==='⌬'
    ? '<path d="M24 6 40 15v18L24 42 8 33V15Z"/><path d="M24 13 34 19v11l-10 6-10-6V19Z" opacity=".45"/><path d="M24 6v7M40 15l-6 4M40 33l-6-3M24 42v-6M8 33l6-3M8 15l6 4"/><circle cx="24" cy="24" r="4"/>'
    : '<rect x="9" y="10" width="30" height="28" rx="5"/><path d="M9 19h30M19 19v19M19 28h20" opacity=".6"/><path d="M16 6v8M32 6v8"/><circle cx="29" cy="28" r="2"/>';
  return '<div class="empty"><div class="symbol" aria-hidden="true"><svg viewBox="0 0 48 48">'+drawing+'</svg></div><strong>'+title+'</strong><p>'+text+'</p></div>';
}
function brandTags(s){return s.brands.length?s.brands.map(b=>'<span class="brand-tag brand-'+C.brands.indexOf(b)+'">'+esc(b)+'</span>').join(''):'<span class="brand-tag brand-unknown">合作品牌待完善</span>';}
function renderBrandSummary(){const list=state.suppliers;$('brandSummary').innerHTML=C.brands.map((brand,i)=>{const suppliers=list.filter(s=>s.brands.includes(brand)),shared=suppliers.filter(s=>s.brands.length>1).length;return '<button type="button" class="brand-resource brand-'+i+'" data-brand-filter="'+brand+'"><span>'+brand+'</span><strong>'+suppliers.length+'<small>家供应商</small></strong><em>专供 '+(suppliers.length-shared)+' 家 · 多品牌合作 '+shared+' 家</em></button>';}).join('');}
function render(){const previous=[...$('metrics').querySelectorAll('strong')].map(node=>Number(node.textContent));const list=state.suppliers,total=list.length,processing=list.filter(s=>s.type==='加工').length,external=list.filter(s=>s.type==='外采').length,fabric=list.filter(s=>s.type==='面料').length,cats=[...new Set(list.flatMap(s=>s.categories))];$('metrics').innerHTML=[['供应商资源总数',total,'已登记真实资源'],['工厂供应商',processing+external,'加工 '+processing+' / 外采 '+external],['面料供应商',fabric,'主营面料与供应能力'],['品类覆盖',cats.length,'按已登记品类统计'],['评估有据资源',list.filter(s=>s.evidence&&C.ratingKeys.some(k=>C.known(s[k]))).length,'评估分与依据同时提供']].map(x=>'<div class="metric"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join('');animateMetrics(previous);$('coverage').textContent=processing+external?'工厂构成：加工 '+Math.round(processing/(processing+external)*100)+'% / 外采 '+Math.round(external/(processing+external)*100)+'%':'工厂构成：待接入资料';$('categoryList').innerHTML=cats.map(c=>'<option value="'+esc(c)+'">').join('');const existing=new Set([...$('filterType').options].map(o=>o.value));list.forEach(s=>{if(!existing.has(s.type)){$('filterType').add(new Option(s.type,s.type));existing.add(s.type);}});renderBrandSummary();renderDirectory();renderProfile();if(tierPreview)tierPreview=buildTierPreview();renderTiers();}
function animateMetrics(previous){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  $('metrics').querySelectorAll('strong').forEach((node,i)=>{
    const end=Number(node.textContent),start=previous[i];if(!Number.isFinite(start)||start===end)return;
    const begun=performance.now();function frame(now){if(!node.isConnected)return;const progress=Math.min(1,(now-begun)/350);node.textContent=String(Math.round(start+(end-start)*(1-Math.pow(1-progress,3))));if(progress<1)requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
}
const compareIds=new Set();
function aggregateScore(s){
  const keys=C.ratingKeys.filter(k=>C.known(s[k])&&state.weights[k]>0);
  const total=keys.reduce((sum,k)=>sum+state.weights[k],0);
  return {score:total?Math.round(keys.reduce((sum,k)=>sum+s[k]*state.weights[k],0)/total):null,coverage:keys.length,verified:Boolean(s.evidence.trim())};
}
function aggregateLabel(s){const a=aggregateScore(s);return a.score===null?'综合评分待完善':(a.verified?'有据综合':'录入综合')+' '+a.score+' / 100';}
function updateCompare(){
  for(const id of compareIds)if(!state.suppliers.some(s=>s.id===id))compareIds.delete(id);
  $('compareCount').textContent=compareIds.size?'已选 '+compareIds.size+' / 4 家':'选择 2–4 家进行对比';
  $('compareOpen').disabled=compareIds.size<2;
  $('compareClear').disabled=!compareIds.size;
}
function renderDirectory(){
  const q=$('search').value.trim().toLowerCase(),type=$('filterType').value,status=$('filterStatus').value,brand=$('filterBrand').value,category=$('filterCategory').value;
  const cats=[...new Set(state.suppliers.flatMap(s=>s.categories))].sort((a,b)=>a.localeCompare(b,'zh'));
  $('filterCategory').innerHTML='<option value="">全部品类</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  $('filterCategory').value=cats.includes(category)?category:'';
  const activeFilters=[type,status,brand,$('filterCategory').value].filter(Boolean).length;
  $('filterActiveCount').textContent=activeFilters?'已启用 '+activeFilters+' 项':'不限条件';
  const filtered=state.suppliers.filter(s=>(!type||s.type===type)&&(!status||s.status===status)&&(!$('filterCategory').value||s.categories.includes($('filterCategory').value))&&(!brand||(brand==='__unknown'?!s.brands.length:s.brands.includes(brand)))&&[s.name,s.region,...s.categories,...s.brands].join(' ').toLowerCase().includes(q));
  document.querySelectorAll('[data-brand-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.brandFilter===brand)));
  $('count').textContent=filtered.length+' / '+state.suppliers.length+' 家';
  const scrollTop=$('directory').scrollTop;
  $('directory').innerHTML=filtered.length?filtered.map(s=>{
    const a=aggregateScore(s);
    return '<article class="supplier-row '+(s.id===selected?'selected':'')+'" data-card-select="'+esc(s.id)+'"><div class="supplier-card-head"><button class="supplier-name" data-select="'+esc(s.id)+'" aria-pressed="'+(s.id===selected)+'">'+esc(s.name)+'</button><span class="supplier-status '+(s.status==='合作中'?'good':s.status==='暂停合作'?'bad':'')+'">'+value(s,'status')+'</span></div><small>'+esc(s.type)+' · '+value(s,'region')+'</small><div class="supplier-card-tags"><div class="supplier-categories">'+(s.categories.length?s.categories.map(c=>'<span class="tag">'+esc(c)+'</span>').join(''):'<span class="muted">品类待完善</span>')+'</div><div class="brand-tags">'+brandTags(s)+'</div></div><div class="supplier-card-footer"><span class="directory-score" title="已提供指标按当前规则加权平均；'+a.coverage+' / 6 项，'+(a.verified?'已提供评估依据':'评估依据待完善，不参与匹配评分')+'">'+aggregateLabel(s)+'</span><label class="compare-choice"><input type="checkbox" data-compare="'+esc(s.id)+'" '+(compareIds.has(s.id)?'checked':'')+'>对比</label></div></article>';
  }).join(''):empty('◇',state.suppliers.length?'没有符合筛选条件的供应商':'资源库等待真实资料','新增供应商或批量导入资料后，画像与需求匹配将自动更新。');
  $('directory').scrollTop=scrollTop;updateCompare();
}
function radar(s){
  const keys=C.ratingKeys.slice(0,5),verified=Boolean(s.evidence.trim()),color=verified?'#84decf':'#decaa1';
  const point=(i,r)=>{const a=-Math.PI/2+i*Math.PI*2/5;return [130+Math.cos(a)*r,110+Math.sin(a)*r];};
  const polygon=points=>points.map(p=>p.join(',')).join(' ');
  const description='已录入评分雷达图'+(verified?'':'，评估依据待补充')+'；缺失指标待完善';
  let svg='<svg viewBox="0 0 260 230" role="img" aria-label="'+description+'">';
  [25,50,75].forEach(r=>svg+='<polygon points="'+polygon(keys.map((k,i)=>point(i,r)))+'" fill="none" stroke="#304359"/>');
  keys.forEach((k,i)=>{const p=point(i,75),t=point(i,100);svg+='<path d="M130 110 L'+p.join(' ')+'" stroke="#304359"/><text x="'+t[0]+'" y="'+t[1]+'" fill="#9aacbf" text-anchor="middle" font-size="9">'+esc(labels[k].replace('评分',''))+'</text>';});
  if(keys.every(k=>C.known(s[k])))svg+='<polygon class="radar-scores" points="'+polygon(keys.map((k,i)=>point(i,s[k]*.75)))+'" fill="'+color+'22" stroke="'+color+'"'+(verified?'':' stroke-dasharray="4 3"')+'/>';
  keys.forEach((k,i)=>{if(C.known(s[k])){const [x,y]=point(i,s[k]*.75);svg+='<circle class="radar-score" cx="'+x+'" cy="'+y+'" r="4" fill="'+color+'"><title>'+esc(labels[k])+': '+s[k]+' / 100</title></circle>';}});
  return svg+'</svg>';
}
function scoreDisplay(s,k){return C.known(s[k])?value(s,k,' / 100'):'待完善';}
function quantityLabel(key,type){return (labels[key]||key).replace('（件 / 米）','（'+(type==='面料'?'米':'件')+'）');}
function updateEditorUnits(){const type=$('fields').querySelector('select[name="type"]')?.value||'加工';$('fields').querySelectorAll('[data-field-label]').forEach(node=>{node.textContent=quantityLabel(node.dataset.fieldLabel,type);});}
$('fields').addEventListener('change',event=>{if(event.target.matches('select[name="type"]'))updateEditorUnits();});
function capacityRange(s,unit){if(!C.known(s.dailyCapacityMin)&&!C.known(s.dailyCapacityMax))return '待完善';return value(s,'dailyCapacityMin')+' ～ '+value(s,'dailyCapacityMax')+' '+unit;}
function profileModule(title,keys,s,open=false){
  return '<details class="profile-module" '+(open?'open':'')+'><summary>'+title+'<span>查看资料</span></summary><div class="profile-detail-grid">'+keys.map(k=>{
    const v=k==='categories'?(s.categories.length?s.categories.join(' / '):'待完善'):k==='categoryRatings'?(Object.keys(s.categoryRatings).length?JSON.stringify(s.categoryRatings):'待完善'):C.known(s[k])?s[k]:'待完善';
    return '<div class="detail-line"><span>'+esc(quantityLabel(k,s.type))+'</span><b>'+esc(typeof v==='object'?JSON.stringify(v):v)+'</b></div>';
  }).join('')+'</div></details>';
}
function renderProfile(){
  const s=state.suppliers.find(s=>s.id===selected);$('edit').disabled=!s;
  $('closePortrait').disabled=!s;$('profile').hidden=!s;
  if(!s){$('profile').innerHTML=empty('⌬','选择供应商，查看完整能力画像','从左侧资源库选择供应商。规模、交付与能力评估均来自已登记资料。');return;}
  const unit=s.type==='面料'?'米':'件',a=aggregateScore(s);
  const grade=s.extra['合作等级'];
  const stats=[['employees','员工人数',value(s,'employees','人')],['area','生产面积',value(s,'area','㎡')],['machines','车位数量',value(s,'machines','台')],['dailyCapacityRange','理论日产能',capacityRange(s,unit+' / 日')],['moq','最低起订量',value(s,'moq',unit)],['availableCapacity','当前可用产能',value(s,'availableCapacity',unit)],['leadDays','生产 / 供货周期',value(s,'leadDays','天')],['utilization','实际产能利用率',value(s,'utilization','%')]];
  $('profile').innerHTML='<div class="profile-identity"><div class="profile-title"><div><span class="eyebrow">SUPPLIER PROFILE</span><h3>'+esc(s.name)+'</h3><span class="muted">'+esc(s.id)+' · '+esc(s.type)+' · '+value(s,'region')+'</span></div><div class="identity-status"><span class="badge">'+value(s,'status')+'</span><small>合作等级 · '+esc(C.known(grade)?grade:'待完善')+'</small></div></div><div class="brand-tags profile-brands">'+brandTags(s)+'</div></div><div class="profile-stats">'+stats.map(([k,label,v])=>'<div class="profile-stat"><span>'+label+'</span><b>'+v+'</b></div>').join('')+'</div><section class="ability-panel"><div class="ability-heading"><div><h3>综合能力评估</h3><small>已录入 '+a.coverage+' / 6 项 · 缺失指标不补零</small></div><span class="badge">'+aggregateLabel(s)+'</span></div><div class="portrait-chart"><div class="radar-wrap">'+radar(s)+'<small>五维能力 · 0–100 分</small></div><div class="rating-bars">'+C.ratingKeys.map(k=>'<div class="rating-item"><div><span>'+esc(labels[k].replace('评分',''))+'</span><b>'+scoreDisplay(s,k)+'</b></div><div class="rating-track" '+(C.known(s[k])?'role="meter" aria-label="'+esc(labels[k])+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+s[k]+'"':'')+'>'+(C.known(s[k])?'<span style="width:'+s[k]+'%"></span>':'')+'</div></div>').join('')+'</div></div>'+'</section><div class="profile-modules">'
  +profileModule('资质与合作信息',['type','region','tax','status'],s)
  +profileModule('生产资源',['employees','machines','area','dailyCapacityMin','dailyCapacityMax','utilization','supplyScale'],s)
  +profileModule('品类与工艺能力',['categories','strengths','categoryRatings'],s,true)
  +profileModule('报价、交期与产能有效性',['priceMin','priceMax','leadDays','moq','availableCapacity','availableAsOf','availableUntil'],s)
  +profileModule('评估依据与合作记录',['evidence'],s)
  +(Object.keys(s.extra).length||C.known(s.dailyCapacity)?'<details class="profile-module"><summary>扩展资料与历史字段<span>查看资料</span></summary><div class="profile-detail-grid">'+[...(C.known(s.dailyCapacity)?[['旧版理论日产能单值',s.dailyCapacity+' '+unit+' / 日']]:[]),...Object.entries(s.extra)].map(([k,v])=>'<div class="detail-line"><span>'+esc(k)+'</span><b>'+esc(typeof v==='object'?JSON.stringify(v):v)+'</b></div>').join('')+'</div></details>':'')+'</div>';
}
function selectSupplier(id,toggle=false){
  selected=toggle&&selected===id?null:id;
  renderDirectory();renderProfile();
  if(selected)$('portrait').scrollIntoView({behavior:'smooth'});
}
function closePortrait(){selected=null;renderDirectory();renderProfile();}
function showCompare(){
  const list=state.suppliers.filter(s=>compareIds.has(s.id));if(list.length<2){toast('请选择至少 2 家供应商');return;}
  const rows=[['供应商类型',s=>value(s,'type')],['合作状态',s=>value(s,'status')],['合作品牌',s=>brandTags(s)],['擅长品类',s=>esc(s.categories.join(' / ')||'待完善')],['综合评分',s=>aggregateLabel(s)],['评估覆盖',s=>aggregateScore(s).coverage+' / 6 项'],['评估依据',s=>esc(s.evidence||'待完善')],['员工人数',s=>value(s,'employees','人')],['生产面积',s=>value(s,'area','㎡')],['车位数量',s=>value(s,'machines','台')],['理论日产能',s=>capacityRange(s,(s.type==='面料'?'米':'件')+' / 日')],['最低起订量',s=>value(s,'moq',s.type==='面料'?'米':'件')],['实际可用产能',s=>value(s,'availableCapacity',s.type==='面料'?'米':'件')],['产能核实日期',s=>value(s,'availableAsOf')],['产能有效至',s=>value(s,'availableUntil')],['供货周期',s=>value(s,'leadDays','天')],['最低单价',s=>value(s,'priceMin','元')],['最高单价',s=>value(s,'priceMax','元')],...C.ratingKeys.map(k=>[labels[k],s=>scoreDisplay(s,k)])];
  $('compareTable').innerHTML='<table><thead><tr><th scope="col">对比指标</th>'+list.map(s=>'<th scope="col">'+esc(s.name)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([label,fn])=>'<tr><th scope="row">'+esc(label)+'</th>'+list.map(s=>'<td>'+fn(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  $('compareDialog').showModal();
}
$('compareOpen').onclick=showCompare;
$('compareClear').onclick=()=>{compareIds.clear();renderDirectory();};
$('directory').addEventListener('change',e=>{const input=e.target.closest('[data-compare]');if(!input)return;if(input.checked&&compareIds.size>=4){input.checked=false;toast('最多对比 4 家供应商');return;}input.checked?compareIds.add(input.dataset.compare):compareIds.delete(input.dataset.compare);updateCompare();});
function matchingEvidence(r){
  if(!r)return '<p class="muted">尚未绑定订单需求，需核实承接条件。</p>';
  return '<div class="tier-evidence"><div class="tier-evidence-status '+(r.status==='满足条件'?'good':r.status==='不满足条件'?'bad':'pending')+'">'+r.status+'</div><div class="tier-score">'+(r.score===null?'评分待完善':'综合 '+r.score+' / 100')+' · 评估覆盖 '+r.coverage+'%</div><details class="tier-reasons" open><summary>匹配依据 · '+r.pass.length+' 项满足'+(r.pending.length?' / '+r.pending.length+' 项待核实':'')+(r.fail.length?' / '+r.fail.length+' 项不满足':'')+'</summary><ul>'+r.pass.map(x=>'<li>'+esc(x)+'</li>').join('')+r.pending.map(x=>'<li class="pending">待核实：'+esc(x)+'</li>').join('')+r.fail.map(x=>'<li class="bad">不满足：'+esc(x)+'</li>').join('')+'</ul></details><div class="tier-risk">'+(r.scores.length?'评分依据：'+esc(r.scores.map(x=>labels[x.key]+' '+x.value+'（权重 '+x.weight+'）').join(' · ')):'评估依据待完善，暂不能判断综合优势。')+'</div><button type="button" data-select="'+esc(r.supplier.id)+'">查看产能画像 →</button></div>';
}
function renderMatches(bound=demand){
  if(!bound){$('results').innerHTML='';return;}
  results=C.rank(state.suppliers,bound,state.weights);
  const selectedIds=new Set([...document.querySelectorAll('[data-slot]')].map(el=>el.value).filter(Boolean));
  const remaining=results.filter(r=>!selectedIds.has(r.supplier.id));
  if(!remaining.length){$('results').innerHTML=results.length?'':'<p class="muted">暂无可匹配资源，请先接入真实供应商资料。</p>';return;}
  $('results').innerHTML='<details class="other-candidates"><summary>其他候选与待核实资源 <span>'+remaining.length+' 家</span></summary><div class="candidate-grid">'+remaining.map(r=>'<article class="result"><strong>'+esc(r.supplier.name)+'</strong>'+matchingEvidence(r)+'</article>').join('')+'</div></details>';
}
function buildTierPreview(){
  if(!demand)return null;
  const ranked=C.rank(state.suppliers,demand,state.weights),eligible=ranked.filter(r=>r.status==='满足条件').slice(0,4);
  return {demand:{...demand},slots:eligible.map(r=>({id:r.supplier.id,note:'替代前需复核产能预留与交期；能力差异及其他替代条件待补充。'}))};
}
function previewCurrentMatch(){
  tierPreview=buildTierPreview();if(!tierPreview)return;
  $('tierCategory').value=demand.category;renderTiers();
}
function renderTiers(){
  const category=$('tierCategory').value.trim(),isPreview=tierPreview?.demand.category===category;
  const tier=(isPreview?tierPreview:state.tiers[category])||{slots:[]};
  const bound=tier.demand||(demand?.category===category?demand:null);
  const ranked=bound?C.rank(state.suppliers,bound,state.weights):[];
  const eligible=ranked.filter(r=>r.status==='满足条件'),pending=ranked.filter(r=>r.status==='待核实'),failed=ranked.filter(r=>r.status==='不满足条件');
  $('tierPreviewStatus').innerHTML=isPreview?'<strong>需求匹配与梯队方案 · '+esc(category)+'</strong><span>'+eligible.length+' 家满足条件 · '+pending.length+' 家待核实 · '+failed.length+' 家不满足。推荐依据见下方卡片，预览尚未保存。</span>':category?'<span>'+esc(category)+' · '+(state.tiers[category]?'已保存梯队':'暂无已保存梯队，可生成匹配预览或手动选择')+'</span>':'<span>先生成需求匹配，自动展示推荐依据及 1 主 3 备方案；或输入品类手动维护。</span>';
  $('tierCards').innerHTML=['核心主供应商','第一备选','第二备选','第三备选'].map((label,i)=>{
    const slot=tier.slots[i]||{},supplier=state.suppliers.find(s=>s.id===slot.id);
    const check=supplier&&bound?C.match(supplier,bound,state.weights):null;
    return '<div class="tier-card"><h3><span class="eyebrow">0'+(i+1)+'</span> '+label+'</h3><select data-slot="'+i+'" aria-label="'+label+'"><option value="">空缺 · 不强行补齐</option>'+state.suppliers.filter(s=>s.categories.includes(category)).map(s=>'<option value="'+esc(s.id)+'" '+(s.id===slot.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select><div id="tierEvidence'+i+'">'+(supplier?matchingEvidence(check):'<p class="muted">'+(isPreview?(tier.slots.length?'推荐资源不足，保留空缺':'暂无满足全部硬性条件的资源，请查看下方待核实事项。'):'等待匹配或手动选择')+'</p>')+'</div><label class="tier-note-label">合作与替代备注<textarea data-note="'+i+'" placeholder="能力差异、合作安排及替代条件" aria-label="'+label+'选择与替代理由">'+esc(slot.note||'')+'</textarea></label></div>';
  }).join('');
  renderMatches(bound);
}
$('tierCards').addEventListener('change',event=>{
  const select=event.target.closest('[data-slot]');if(!select)return;
  const category=$('tierCategory').value.trim(),tier=tierPreview?.demand.category===category?tierPreview:state.tiers[category];
  const bound=tier?.demand||(demand?.category===category?demand:null),supplier=state.suppliers.find(s=>s.id===select.value);
  $('tierEvidence'+select.dataset.slot).innerHTML=supplier?matchingEvidence(bound?C.match(supplier,bound,state.weights):null):'<p class="muted">当前空缺，可选择其他合适供应商。</p>';
  renderMatches(bound);
});
const editorGroups = [
  { title: '基础信息', hint: '先确认名称、类型及合作状态', keys: ['name','type','status','region','tax','id','brands'] },
  { title: '生产规模与品类', hint: '理论能力与实际可用产能分别记录', keys: ['employees','machines','area','dailyCapacityMin','dailyCapacityMax','utilization','categories','strengths','supplyScale'] },
  { title: '交付与可用产能', hint: '可用产能需同时填写核实日期和有效期', keys: ['moq','leadDays','availableCapacity','availableAsOf','availableUntil'] },
  { title: '综合评估', hint: '评价分为 0–100，须提供实际评估依据', keys: ['specialization','delivery','quality','cost','cooperation','priority','categoryRatings','evidence'] },
  { title: '扩展资料', hint: '可选：记录现有字段未覆盖的信息', keys: ['extra'] }
];
function openEditor(id) {
  editing = id || null;
  const supplier = state.suppliers.find(s => s.id === id) || {};
  $('editorTitle').textContent = id ? '编辑供应商资料' : '新增供应商';
  $('delete').hidden = !id;
  const definitions = new Map(C.fields.map(field => [field[0], field]));
  const fullWidth = new Set(['categories','strengths','supplyScale','categoryRatings','evidence','extra']);
  function renderField(key) {
    const [k, baseLabel, type] = definitions.get(key);
    const label = quantityLabel(k,supplier.type||'加工');
    let v = supplier[k] ?? '';
    if (k === 'id' && !id) v = 'SUP-' + Date.now().toString(36).toUpperCase();
    if (k === 'categories') v = supplier.categories?.join('/') || '';
    if (k === 'extra' || k === 'categoryRatings') v = JSON.stringify(supplier[k] || {}, null, 2);
    const attr = ' autocomplete="off" name="' + (k === 'name' ? 'supplierCompanyName' : k) + '" '
      + (['id','name','type'].includes(k) ? 'required ' : '') + (k === 'id' && id ? 'readonly ' : '');
    let control;
    if (type === 'brands') {
      return '<div class="field-wide brand-field" role="group" aria-label="合作品牌"><span class="brand-field-title">合作品牌 <small>可多选，未登记时留空</small></span><div class="brand-choices">'
        + C.brands.map((brand,i)=>'<label class="brand-choice brand-'+i+'"><input type="checkbox" name="brands" value="'+brand+'" '+(supplier.brands?.includes(brand)?'checked':'')+'><span>'+brand+'</span></label>').join('')+'</div></div>';
    }
    if (type === 'type' || type === 'status') {
      const options = type === 'type' ? ['加工','外采','面料',...new Set(state.suppliers.map(x => x.type))] : ['','待评估','合作中','暂停合作'];
      control = '<select' + attr + '>' + [...new Set(options)].map(o => '<option ' + (o === v ? 'selected' : '') + ' value="' + esc(o) + '">' + esc(o || '待完善') + '</option>').join('') + '</select>';
    } else if (type === 'date') {
      const inputId = 'supplier-date-' + k;
      return '<div class="supplier-date-field"><label for="' + inputId + '">' + label + '</label>'
        + '<div class="supplier-date-control"><input' + attr + ' id="' + inputId + '" type="text" value="' + esc(v)
        + '" placeholder="YYYY-MM-DD" inputmode="numeric" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" aria-describedby="' + inputId + '-hint">'
        + '<button type="button" data-calendar-toggle aria-label="选择' + label + '" aria-expanded="false">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16M8 15h2M14 15h2"/></svg></button></div>'
        + '<small class="muted" id="' + inputId + '-hint">点击日历选择，或输入年-月-日</small>'
        + '<div class="supplier-calendar" hidden></div></div>';
    } else if (type === 'textarea') {
      control = '<textarea' + attr + '>' + esc(v) + '</textarea>';
    } else {
      // Plain numeric entry prevents native wheel/arrow/spinner actions from changing business data.
      // SupplierCore.normalize still enforces numbers, integer fields, ranges and score limits on save.
      control = '<input' + attr + ' type="' + (type === 'number' ? 'text' : type) + '" value="' + esc(v) + '" '
        + (type === 'number' ? 'inputmode="' + (['employees','machines','leadDays','moq'].includes(k) ? 'numeric' : 'decimal') + '" data-numeric-field ' : '')
        + (k === 'categories' ? ' placeholder="例如：毛衣/风衣/双面呢"' : '') + '>';
    }
    const legacy = k === 'dailyCapacityMax' && C.known(supplier.dailyCapacity)
      ? '<small class="muted">原记录单值：' + esc(supplier.dailyCapacity) + '；范围请核实填写。</small>' : '';
    return '<label' + (fullWidth.has(k) ? ' class="field-wide"' : '') + '>' + '<span data-field-label="'+k+'">'+label+'</span>' + control + legacy + '</label>';
  }
  function renderGroupFields(group) {
    return group.keys.map(key => {
      if (key === 'dailyCapacityMin') return '<div class="editor-related">' + ['dailyCapacityMin','dailyCapacityMax','utilization'].map(renderField).join('') + '</div>';
      if (['dailyCapacityMax','utilization'].includes(key)) return '';
      if (key === 'availableAsOf') return '<div class="editor-related editor-grid-pair">' + ['availableAsOf','availableUntil'].map(renderField).join('') + '</div>';
      if (key === 'availableUntil') return '';
      return renderField(key);
    }).join('');
  }
  $('fields').innerHTML = editorGroups.map((group, i) =>
    '<fieldset class="editor-group"><legend><span>' + String(i + 1).padStart(2, '0') + '</span>' + group.title + '</legend>'
    + '<p class="group-hint">' + group.hint + '</p><div class="editor-grid' + (group.columns === 2 ? ' editor-grid-pair' : '') + '">'
    + renderGroupFields(group) + '</div></fieldset>'
  ).join('');
  $('editor').showModal();
  $('editor').scrollTop = 0;
}
$('supplierForm').onsubmit=async e=>{e.preventDefault();try{const formData=new FormData(e.target);const raw=Object.fromEntries(formData);raw.brands=formData.getAll('brands');raw.name=raw.supplierCompanyName;delete raw.supplierCompanyName;const s=C.normalize({...state.suppliers.find(x=>x.id===editing),...raw});const list=state.suppliers.filter(x=>x.id!==editing);if(list.some(x=>x.id===s.id))throw Error('供应商 ID 已存在');if(!await persist({...state,suppliers:[...list,s]}))return;selected=s.id;$('editor').close();render();toast('资料已保存，画像与推荐已更新');}catch(e){toast(e.message);}};
$('closePortrait').onclick=closePortrait;$('add').onclick=()=>openEditor();$('edit').onclick=()=>openEditor(selected);$('delete').onclick=async ()=>{if(!confirm('删除此供应商资料？请先导出需要保留的备份。'))return;if(await persist({...state,suppliers:state.suppliers.filter(s=>s.id!==editing)})){$('editor').close();selected=null;render();}};
document.addEventListener('click',e=>{const brandButton=e.target.closest('[data-brand-filter]');if(brandButton){$('filterBrand').value=brandButton.dataset.brandFilter;$('filterType').value='';$('filterStatus').value='';$('filterCategory').value='';$('search').value='';renderDirectory();location.hash='library';$('library').scrollIntoView({behavior:'smooth'});}const close=e.target.closest('[data-close]');if(close)$(close.dataset.close).close();const select=e.target.closest('[data-select]')||(!e.target.closest('.compare-choice')&&e.target.closest('[data-card-select]'));if(select){selectSupplier(select.dataset.select||select.dataset.cardSelect,!!select.closest('[data-card-select]'));}});['search','filterType','filterStatus','filterBrand','filterCategory'].forEach(k=>$(k).addEventListener('input',renderDirectory));$('matchForm').onsubmit=e=>{e.preventDefault();demand=Object.fromEntries(new FormData(e.target));demand.category=demand.category.trim();demand.region=demand.region.trim();demand.quantity=Number(demand.quantity);if(!demand.category||!Number.isInteger(demand.quantity)||demand.quantity<1){toast('请填写有效品类和整数数量');return;}for(const k of ['minEmployees'])demand[k]=demand[k]===''?null:Number(demand[k]);previewCurrentMatch();$('tiers').scrollIntoView({behavior:'smooth'});};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}$('export').onclick=()=>download('供应商资料备份.json',JSON.stringify(state,null,2),'application/json');$('import').onclick=()=>{$('importPreview').textContent='';pendingImport=[];pendingBackup=null;$('confirmImport').disabled=true;$('importFile').value='';$('importDialog').showModal();};$('template').onclick=()=>download('供应商导入模板.csv','\uFEFF'+C.fields.map(f=>f[0]).join(',')+'\r\n','text/csv;charset=utf-8');$('importFile').onchange=async e=>{pendingImport=[];pendingBackup=null;$('confirmImport').disabled=true;try{const file=e.target.files[0];if(!file)return;const text=await file.text(),parsed=file.name.toLowerCase().endsWith('.json')?JSON.parse(text):C.parseCSV(text);const list=Array.isArray(parsed)?parsed:parsed.suppliers;if(!Array.isArray(list)||!list.length)throw Error('没有供应商记录');pendingImport=list.map((r,i)=>{try{return C.normalize(r);}catch(e){throw Error('第 '+(i+1)+' 条：'+e.message);}});if(new Set(pendingImport.map(s=>s.id)).size!==pendingImport.length)throw Error('导入文件包含重复 ID');if(!Array.isArray(parsed)&&parsed.version===1){const w={...C.weights,...parsed.weights};if(!Object.values(w).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||!Object.values(w).some(v=>v>0))throw Error('备份评分权重无效');const tiers=parsed.tiers||{};if(typeof tiers!=='object'||Array.isArray(tiers)||Object.values(tiers).some(t=>!t||!Array.isArray(t.slots)||t.slots.length>4||t.slots.some(x=>!x||typeof x.id!=='string'||(x.note!=null&&typeof x.note!=='string'))||(t.demand&&(!Number.isInteger(t.demand.quantity)||t.demand.quantity<1||typeof t.demand.category!=='string'))))throw Error('备份梯队格式无效');pendingBackup={weights:w,tiers};} $('importPreview').textContent=(pendingBackup?'同时恢复备份中的规则与梯队。\n':'')+pendingImport.length+' 条资料校验通过。\n'+pendingImport.map(s=>s.id+' · '+s.name+' · '+s.type+(state.suppliers.some(x=>x.id===s.id)?'（更新）':'（新增）')).join('\n');$('confirmImport').disabled=false;}catch(e){pendingImport=[];$('importPreview').textContent='未导入：'+e.message;}};$('confirmImport').onclick=async ()=>{if(!pendingImport.length)return;const ids=new Set(pendingImport.map(s=>s.id));if(await persist({...state,...(pendingBackup||{}),suppliers:[...state.suppliers.filter(s=>!ids.has(s.id)),...pendingImport]})){$('importDialog').close();render();toast('导入完成：'+pendingImport.length+' 条供应商资料');}};
$('rules').onclick=()=>{$('weightFields').innerHTML=C.ratingKeys.map(k=>'<label>'+labels[k]+'权重<input type="number" min="0" step="1" required name="'+k+'" value="'+state.weights[k]+'"></label>').join('');$('rulesDialog').showModal();};$('ruleForm').onsubmit=async e=>{e.preventDefault();const w=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)]));if(!Object.values(w).every(v=>Number.isFinite(v)&&v>=0)||!Object.values(w).some(v=>v>0)){toast('至少设置一个正权重');return;}if(await persist({...state,weights:w})){$('rulesDialog').close();render();toast('评分规则已更新');}};
$('tierCategory').oninput=renderTiers;$('autoTier').onclick=async ()=>{if(!demand){toast('请先生成需求匹配');return;}const tier=buildTierPreview(),category=demand.category;if(await persist({...state,tiers:{...state.tiers,[category]:tier}})){tierPreview=null;$('tierCategory').value=category;renderTiers();toast('已保存 '+tier.slots.length+' 家满足条件的供应商');}};
$('saveTier').onclick=async ()=>{const category=$('tierCategory').value.trim();if(!category){toast('请输入梯队品类');return;}const slots=[...document.querySelectorAll('[data-slot]')].map((el,i)=>({id:el.value,note:document.querySelector('[data-note="'+i+'"]').value.trim()}));const ids=slots.map(s=>s.id).filter(Boolean);if(new Set(ids).size!==ids.length){toast('同一梯队不能重复选择供应商');return;}const bound=demand?.category===category?{...demand}:state.tiers[category]?.demand||null;if(bound&&ids.some(id=>C.match(state.suppliers.find(s=>s.id===id),bound,state.weights).status!=='满足条件')){toast('所选供应商未满足已绑定需求，请先补全资料或调整选择');return;}if(await persist({...state,tiers:{...state.tiers,[category]:{slots,demand:bound}}})){tierPreview=null;renderTiers();toast('梯队已保存');}};render();initializeStorage();})();
